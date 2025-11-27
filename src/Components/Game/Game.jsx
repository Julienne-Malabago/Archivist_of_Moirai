import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from "firebase/firestore";
// FIX: Adjusting import path back to one level up. If the component is in src/Components/Game/
// and firebase.js is in src/firebase.js, the correct path is often assumed to be two levels up (../../).
// Since the compiler previously failed on two levels, we are trying one level up as a common fix for module resolution issues.
import { db } from "../../firebase.js"; 

// Replace with your Flask Backend URL (e.g., 'https://your-archivist-backend.onrender.com')
const API_BASE_URL = "http://127.0.0.1:5000"; 

// Theme Colors for easy reference (from index.css)
const THEME_PARCHMENT = '#f7f4e9';
const THEME_DARK_TEXT = '#363636';
const THEME_GOLD = '#ffd700';
const THEME_DARK_TITLE = '#5d4037'; // A dark brown/sepia tone

// Game constants for clarity
const AXIOMS = ['Fate', 'Choice', 'Chance'];

export default function Game({ user, onSignOut }) {
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [fragment, setFragment] = useState(null);
    const [message, setMessage] = useState({ text: "", type: "" });
    const [roundActive, setRoundActive] = useState(false);
    const [revealData, setRevealData] = useState(null); // Stores true axiom and justification

    // --- 1. Load User Profile (Score/Streak/Difficulty) ---
    useEffect(() => {
        const fetchProfile = async () => {
            if (!user) return;
            // The 'users' collection stores the user's game stats
            const docRef = doc(db, "users", user.uid);
            try {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setProfile(docSnap.data());
                } else {
                    console.error("User profile not found in Firestore. Creating default profile.");
                    // Initialize a new profile if not found
                    const defaultProfile = { 
                        username: user.email.split('@')[0], // Default username
                        currentScore: 0,
                        currentStreak: 0,
                        highestStreak: 0,
                        difficultyTier: 1,
                    };
                    setProfile(defaultProfile);
                    // Also create the profile document in Firestore
                    await updateDoc(docRef, defaultProfile, { merge: true });
                }
            } catch (error) {
                console.error("Error fetching profile:", error);
                setMessage({ text: "Error loading profile data.", type: "error" });
            }
            setIsLoading(false);
        };
        fetchProfile();
    }, [user]);

    // --- 2. Start Round (Fetch Fragment from Flask) ---
    const startRound = async () => {
        if (!profile) return;
        setIsLoading(true);
        setFragment(null);
        setRevealData(null);
        setMessage({ text: "Consulting the Moirai...", type: "info" });

        try {
            const response = await fetch(`${API_BASE_URL}/api/generate_fragment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: user.uid,
                    difficulty: profile.difficultyTier, 
                }),
            });

            if (!response.ok) {
                // If API fails, check for a JSON error response first
                const errorData = await response.json();
                throw new Error(errorData.error || 'Fragment generation failed on server.');
            }

            const data = await response.json();
            setFragment(data.fragment);
            setRoundActive(true);
            setMessage({ text: "A new Fragment awaits classification.", type: "success" });
        } catch (error) {
            console.error("API Error:", error);
            setMessage({ text: `Failed to load fragment. Check Flask server and CORS setup. (${error.message})`, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    // --- 3. Submit Classification (To Flask) ---
    const classifyFragment = async (userAxiom) => {
        if (!fragment || !roundActive) return;
        setIsLoading(true);
        setMessage({ text: `Submitting ${userAxiom} to the Fates...`, type: "info" });

        try {
            const response = await fetch(`${API_BASE_URL}/api/classify_fragment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: user.uid,
                    userAxiom: userAxiom,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Classification check failed on server.');
            }

            const data = await response.json();
            
            // Update Firestore Profile with new stats
            const newStats = {
                currentScore: data.newScore,
                currentStreak: data.newStreak,
                highestStreak: data.highestStreak, 
                difficultyTier: data.newDifficulty
            };
            
            const userDocRef = doc(db, "users", user.uid);
            await updateDoc(userDocRef, newStats); // Update stats in Firestore

            // Update local state and show Revelation
            setProfile(prev => ({ ...prev, ...newStats }));
            setRevealData({ 
                isCorrect: data.isCorrect,
                trueAxiom: data.trueAxiom,
                revelationText: data.revelationText,
            });
            setRoundActive(false);

            const resultType = data.isCorrect ? "success" : "error";
            const resultMsg = data.isCorrect ? "Classification Confirmed! Wisdom Gained." : "Classification Failed! Narrative Deception.";
            setMessage({ text: resultMsg, type: resultType });

        } catch (error) {
            console.error("Classification Error:", error);
            setMessage({ text: `Failed to process classification. ${error.message}`, type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading || !profile) {
        return (
            <div className="flex justify-center items-center h-screen" style={{backgroundColor: '#1a1a2e'}}>
                <div className="text-xl font-serif text-amber-100 animate-pulse" style={{fontFamily: 'Cinzel, serif'}}>Loading Archivist Profile...</div>
            </div>
        );
    }
    
    // --- JSX RENDER ---
    return (
        // The outer div uses Playfair Display as the primary text font
        <div className="min-h-screen w-full p-4 sm:p-8 text-[#363636]" style={{fontFamily: 'Playfair Display, serif'}}>
            
            {/* Game Container Card: Mimics .login-container with parchment and gold border */}
            <div 
                className="max-w-6xl mx-auto p-6 md:p-10 shadow-2xl rounded-xl"
                style={{
                    backgroundColor: THEME_PARCHMENT,
                    border: `3px solid ${THEME_GOLD}`,
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 10px #ffd700',
                }}
            >
                
                {/* Header */}
                <header className="flex flex-col sm:flex-row justify-between items-center pb-4 mb-6 border-b border-[#795548]">
                    <h1 
                        className="text-3xl font-bold tracking-wider"
                        style={{fontFamily: 'Cinzel, serif', color: THEME_DARK_TITLE}}
                    >
                        Archivist of Moirai
                    </h1>
                    <div className="text-right mt-2 sm:mt-0 text-gray-700">
                        <p className="text-sm">
                            Welcome, <span className="font-semibold">{profile.username || user.email.split('@')[0]}</span> 
                            <span className="ml-2 font-bold" style={{color: THEME_DARK_TITLE}}>(Tier {profile.difficultyTier})</span>
                        </p>
                        <button 
                            className="text-xs text-red-600 hover:text-red-800 transition duration-150" 
                            onClick={onSignOut}
                        >
                            Log Out
                        </button>
                    </div>
                </header>

                {/* Message/Error Display Box */}
                {message.text && (
                    <div 
                        className={`p-3 mb-6 rounded-lg text-center font-medium border ${
                            message.type === 'success' 
                                ? 'bg-[#e6ffec] text-[#2e7d32] border-[#2e7d32]' // Success colors from index.css logic
                                : message.type === 'error' 
                                ? 'bg-[#fce8e6] text-[#cc0000] border-[#cc0000]' // Error colors from index.css logic
                                : 'bg-blue-100 text-blue-800 border-blue-300' // Default info blue (keeping Tailwind default)
                        }`}
                    >
                        {message.text}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    
                    {/* 1. The Tally (Sidebar) */}
                    <div 
                        className="lg:col-span-1 p-6 rounded-lg shadow-inner h-fit"
                        style={{backgroundColor: '#fffaf0', border: '1px solid #ffd700'}}
                    >
                        <h3 
                            className="text-xl font-bold mb-4 border-b pb-2" 
                            style={{fontFamily: 'Cinzel, serif', color: THEME_DARK_TITLE, borderColor: '#795548'}}
                        >
                            The Tally
                        </h3>
                        <div className="space-y-4">
                            {/* Score */}
                            <div className="flex justify-between items-center p-2 rounded-md" style={{backgroundColor: THEME_PARCHMENT}}>
                                <p className="text-gray-700 text-sm">Score</p>
                                <span className="text-3xl font-extrabold" style={{color: THEME_DARK_TITLE}}>{profile.currentScore}</span>
                            </div>
                            {/* Current Streak */}
                            <div className="flex justify-between items-center p-2 rounded-md" style={{backgroundColor: THEME_PARCHMENT}}>
                                <p className="text-gray-700 text-sm">Current Streak</p>
                                <span className="text-3xl font-extrabold" style={{color: profile.currentStreak >= 5 ? '#b8860b' : THEME_DARK_TITLE}}>{profile.currentStreak}</span>
                            </div>
                            {/* Highest Streak */}
                            <div className="flex justify-between items-center p-2 rounded-md" style={{backgroundColor: THEME_PARCHMENT}}>
                                <p className="text-gray-700 text-sm">Highest Streak</p>
                                <span className="text-xl font-bold" style={{color: '#b8860b'}}>{profile.highestStreak}</span>
                            </div>
                        </div>
                        
                        {/* Primary Button: Mimics .button-primary styles */}
                        <button 
                            className="w-full mt-6 py-3 px-4 font-bold rounded-lg transition duration-200 disabled:bg-gray-400 disabled:shadow-none"
                            style={{
                                backgroundColor: THEME_GOLD,
                                color: THEME_DARK_TEXT,
                                fontFamily: 'Cinzel, serif',
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                            }} 
                            onMouseOver={(e) => {
                                if (!e.currentTarget.disabled) {
                                    e.currentTarget.style.backgroundColor = '#b8860b';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 6px 10px rgba(0, 0, 0, 0.2)';
                                }
                            }}
                            onMouseOut={(e) => {
                                if (!e.currentTarget.disabled) {
                                    e.currentTarget.style.backgroundColor = THEME_GOLD;
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                                }
                            }}
                            onClick={startRound}
                            disabled={isLoading || roundActive}
                        >
                            {isLoading ? 'Processing...' : fragment ? 'Next Fragment' : 'Generate Fragment'}
                        </button>
                    </div>

                    {/* 2. The Archival Scroll (Central Display & Classifier) */}
                    <div 
                        className="lg:col-span-3 flex flex-col p-8 rounded-lg shadow-2xl"
                        style={{backgroundColor: '#fffaf0', border: `4px solid ${THEME_DARK_TITLE}`}}
                    >
                        <h2 
                            className="text-2xl font-bold mb-4" 
                            style={{fontFamily: 'Cinzel, serif', color: THEME_DARK_TITLE}}
                        >
                            The Archival Scroll
                        </h2>
                        <div className="flex-grow p-4 mb-6 bg-white border border-[#795548] rounded-lg shadow-inner min-h-[150px] flex items-center justify-center">
                            <p className="text-lg leading-relaxed italic text-gray-700 whitespace-pre-wrap text-center">
                                {fragment || (
                                    roundActive ? (
                                        <div className="flex flex-col items-center">
                                            <div className="w-6 h-6 border-4 border-[#795548] border-t-transparent rounded-full animate-spin mb-2"></div>
                                            <p>Generating...</p>
                                        </div>
                                    ) : (
                                        "Click 'Generate Fragment' to begin your archival duty. The Scroll awaits the Weaver's thread."
                                    )
                                )}
                            </p>
                        </div>
                        
                        {/* 3. The Classifier */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            {AXIOMS.map(axiom => (
                                <button 
                                    key={axiom}
                                    className={`flex-1 py-4 px-2 text-white font-extrabold text-xl uppercase rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-[1.02] disabled:opacity-50`}
                                    style={{
                                        backgroundColor: axiom === 'Fate' ? '#8a2be2' : // Blue Violet
                                                         axiom === 'Choice' ? '#20b2aa' : // Light Sea Green
                                                         '#daa520', // Goldenrod
                                        fontFamily: 'Cinzel, serif',
                                    }}
                                    onClick={() => classifyFragment(axiom)}
                                    disabled={!fragment || !roundActive || isLoading}
                                >
                                    {axiom}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. The Revelation Panel (Modal) */}
            {revealData && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center p-4 z-50">
                    <div 
                        className="p-8 rounded-xl shadow-2xl w-full max-w-xl text-center"
                        style={{
                            backgroundColor: THEME_PARCHMENT,
                            border: `4px solid ${THEME_DARK_TITLE}`,
                            color: THEME_DARK_TEXT
                        }}
                    >
                        <h2 
                            className={`text-3xl font-bold mb-4`} 
                            style={{fontFamily: 'Cinzel, serif', color: revealData.isCorrect ? '#2e7d32' : '#cc0000'}}
                        >
                            {revealData.isCorrect ? '✅ Revelation Confirmed!' : '❌ Narrative Deception!'}
                        </h2>
                        <p className="text-xl mb-4" style={{color: THEME_DARK_TITLE}}>The True Axiom Was: <strong>{revealData.trueAxiom}</strong></p>
                        
                        <div className="justification p-4 mt-4 mb-6 border-l-4 text-left" style={{backgroundColor: '#fffaf0', borderColor: THEME_GOLD}}>
                            <h3 className="text-lg font-semibold mb-2" style={{color: '#b8860b'}}>The Weaver's Justification:</h3>
                            <p className="text-gray-700 italic">{revealData.revelationText}</p>
                        </div>
                        
                        <button 
                            className="w-full py-3 px-4 font-bold rounded-lg shadow-md transition duration-150"
                            style={{
                                backgroundColor: THEME_GOLD,
                                color: THEME_DARK_TEXT,
                                fontFamily: 'Cinzel, serif',
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#b8860b';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = THEME_GOLD;
                            }}
                            onClick={() => {setRevealData(null); setFragment(null);}}
                        >
                            Continue Archival Duty
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export { Game };