import React, { useState, useEffect, useCallback } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { fetchFragmentFromAI } from "../../api/ai";

// Component for the main game interface
export function Game({ user, onSignOut }) {
    // --- State for User Stats & Game Metrics ---
    const [stats, setStats] = useState({
        username: 'The Archivist',
        currentScore: 0,
        currentStreak: 0,
        highestStreak: 0,
        difficultyTier: 1,
        highestScore: 0, // NEW: State for highest score
    });

    // --- State for the Game Round ---
    const [gameState, setGameState] = useState('loading'); // 'loading', 'playing', 'revealing', 'error', 'ready_to_start'
    const [currentFragment, setCurrentFragment] = useState("");
    const [userClassification, setUserClassification] = useState(null); // 'FATE', 'CHOICE', 'CHANCE'
    const [secretTag, setSecretTag] = useState(null); // The true answer
    const [revelationText, setRevelationText] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null); // For displaying API errors
    
    // NEW: Attempt Counter State (5 attempts = 1 round)
    const [attemptCount, setAttemptCount] = useState(0); 

    // NEW: Total Rounds Played State
    const [totalRoundsPlayed, setTotalRoundsPlayed] = useState(0);

    // Tracks if the user has loaded their profile but hasn't started the first round.
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);

    const classifierOptions = ['FATE', 'CHOICE', 'CHANCE'];

    // Utility function to show an alert box (replacing the native alert())
    const showAlert = useCallback((title, message) => {
        setErrorMessage({ title, message });
    }, []);


    // --- FUNCTION: Start a New Game Round / Attempt ---
    const startNewRound = useCallback(async (currentDifficulty) => {
        setGameState('loading');
        setErrorMessage(null); // Clear previous errors
        setUserClassification(null);
        setRevelationText(null);
        setCurrentFragment(""); // Ensure fragment is clear during loading
        
        // **NEW: Handle Round Increment**
        // A 'round' is 5 attempts. If this is the start of a new round (or the first attempt), increment totalRoundsPlayed.
        if (attemptCount === 0) {
            setTotalRoundsPlayed(prevCount => prevCount + 1);
        }
        
        // Increment the attempt count for this session
        setAttemptCount(prevCount => (prevCount + 1) % 5);

        // Use the passed difficulty, or fallback to state
        const effectiveDifficulty = currentDifficulty || stats.difficultyTier;
        
        // 1. Determine the secret tag randomly
        const tags = ['FATE', 'CHOICE', 'CHANCE'];
        const randomSecretTag = tags[Math.floor(Math.random() * tags.length)];
        
        // 2. Call the REAL AI utility function
        try {
            const { fragmentText, revelationText: revText } = await fetchFragmentFromAI(effectiveDifficulty, randomSecretTag);

            // 3. Update state to start playing
            setSecretTag(randomSecretTag);
            setCurrentFragment(fragmentText);
            setRevelationText(revText);
            setGameState('playing');
        } catch (error) {
            console.error("Fragment generation failed:", error);
            // Set a dummy error state for the revelation panel
            setSecretTag("FATE");
            setRevelationText("Due to a system failure, the true causal force cannot be determined. Please ensure your backend server is running and your API key is valid.");

            // CLEAR the fragment so the loading spinner stays or the main area is blank
            setCurrentFragment("");
            
            setGameState('error');
            showAlert("AI Generation Error", error.message);
        }
    }, [stats.difficultyTier, showAlert, attemptCount]); // Dependency on attemptCount for round logic


    // --- EFFECT: Load User Stats from Firestore on Mount ---
    useEffect(() => {
        const fetchUserData = async () => {
            let initialDifficulty = 1; // Safest default
            if (!user) return;

            const userDocRef = doc(db, "users", user.uid);
            try {
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    initialDifficulty = userData.difficultyTier || 1; // Get the real difficulty
                    
                    // NEW: Load total rounds from data if available, otherwise start at 0
                    const initialTotalRounds = userData.totalRoundsPlayed || 0;
                    setTotalRoundsPlayed(initialTotalRounds);

                    // Note: currentScore and currentStreak are reset on load/login as per prompt (except highestStreak and highestScore)
                    setStats(s => ({
                        ...s,
                        username: userData.username || 'The Archivist',
                        currentScore: 0, // RESET ON LOGIN
                        currentStreak: 0, // RESET ON LOGIN
                        highestStreak: userData.highestStreak || 0,
                        difficultyTier: initialDifficulty,
                        highestScore: userData.highestScore || 0, // NEW: Load highest score
                    }));
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
                showAlert("Data Error", "Could not load user progress from the Archives.");
            } finally {
                // Set initialLoadComplete to true and wait for user click
                setGameState('ready_to_start');
                setInitialLoadComplete(true);
            }
        };

        fetchUserData();
    }, [user, showAlert]); // Dependency on user and showAlert

    // --- FUNCTION: Update Stats in Firestore ---
    const updateStatsInDb = useCallback(async (newStats) => {
        const userDocRef = doc(db, "users", user.uid);
        try {
            await updateDoc(userDocRef, {
                currentScore: newStats.currentScore,
                currentStreak: newStats.currentStreak,
                highestStreak: newStats.highestStreak,
                difficultyTier: newStats.difficultyTier,
                highestScore: newStats.highestScore, // NEW: Save highest score
                totalRoundsPlayed: totalRoundsPlayed, // NEW: Save total rounds played
            });
            console.log("Stats successfully updated in Firestore.");
        } catch (error) {
            console.error("Error updating stats in Firestore:", error);
        }
    }, [user.uid, totalRoundsPlayed]); // Dependency on totalRoundsPlayed

    // --- HANDLER: User Classifies the Fragment ---
    const handleClassification = (choice) => {
        if (gameState !== 'playing') return;

        setUserClassification(choice); // Record the user's choice
        setGameState('revealing'); // Enter the revelation phase

        const isCorrect = choice === secretTag;
        
        let newStats = { ...stats };
        let promotionMessage = null;
        
        if (isCorrect) {
            // Correct Logic: Increment Score and Streak
            newStats.currentScore += 10;
            newStats.currentStreak += 1;
            
            // Update Highest Streak
            if (newStats.currentStreak > newStats.highestStreak) {
                newStats.highestStreak = newStats.currentStreak;
            }
            
            // NEW: Update Highest Score
            if (newStats.currentScore > newStats.highestScore) {
                newStats.highestScore = newStats.currentScore;
            }
            
            // Difficulty Scaling Logic: Every 5 consecutive correct answers
            if (newStats.currentStreak % 5 === 0) {
                newStats.difficultyTier += 1;
                promotionMessage = `Archivist Promotion! Difficulty Tier is now ${newStats.difficultyTier}. Prepare for greater subtlety!`;
            }

        } else {
            // Incorrect Logic: Reset Streak
            newStats.currentStreak = 0;
            // The score remains the same on a miss
        }
        
        setStats(newStats); // Update local state
        updateStatsInDb(newStats); // Update Firestore
        // Note: totalRoundsPlayed is saved inside updateStatsInDb

        if (promotionMessage) {
            showAlert("Promotion Achieved", promotionMessage);
        }
    }
    
    // --- Custom Sign Out Handler to reset current score/streak before executing original sign out ---
    const handleSignOut = useCallback(async () => {
        // Prepare final stats for saving, ensuring currentScore and currentStreak are 0
        const finalStats = {
            ...stats,
            currentScore: 0,
            currentStreak: 0,
        };
        
        // Save the final stats to Firestore
        await updateStatsInDb(finalStats);
        
        // Execute the original sign out function
        onSignOut();
    }, [stats, onSignOut, updateStatsInDb]);


    // --- RENDER LOGIC: Loading/Waiting State ---
    if (gameState === 'loading' && !initialLoadComplete) {
        return (
            <div className="game-container fullscreen-layout"> {/* Added fullscreen-layout class */}
                <div className="loading-spinner">
                    <p>Accessing the Archives and Loading User Profile...</p>
                </div>
            </div>
        );
    }

    // --- RENDER LOGIC: Initial Start Button (New State) ---
    if (gameState === 'ready_to_start') {
        return (
            <div className="game-container"> {/* Added fullscreen-layout class */}
                <header className="game-header ribbon-layout">
                    <div className="header-left ribbon-left">
                        <div className="title-block">
                            <span className="star-icon">✨</span>
                            <h1 className="game-title">ARCHIVIST OF MOIRAI</h1>
                        </div>
                        <div className="user-info-block">
                            <p className="welcome-text">Username: **{stats.username}**</p>
                            <p className="user-id">User ID: {user.uid.substring(0, 20)}...</p>
                        </div>
                    </div>
                    <div className="header-right ribbon-right">
                        <span className="sign-out-link button-primary" onClick={handleSignOut}>
                            Log Out
                        </span>
                    </div>
                </header>
                
                <div className="metrics-tally">
                    <div className="metric">
                        <span className="metric-icon">#</span>
                        <p className="metric-label">Total Rounds:</p>
                        <p className="metric-value">{totalRoundsPlayed}</p>
                    </div>
                    <div className="metric">
                        <span className="metric-icon">⭐</span>
                        <p className="metric-label">Highest Score:</p>
                        <p className="metric-value">{stats.highestScore}</p>
                    </div>
                    <div className="metric">
                        <span className="metric-icon">🏆</span>
                        <p className="metric-label">Highest Streak:</p>
                        <p className="metric-value">{stats.highestStreak}</p>
                    </div>
                    <div className="metric">
                        <span className="metric-icon"> tier</span>
                        <p className="metric-label">Difficulty Tier:</p>
                        <p className="metric-value">{stats.difficultyTier}</p>
                    </div>
                </div>
                
                <div className="archival-scroll start-message">
                    <h3 className="scroll-title">Archivist Login Complete</h3>
                    <p className="scroll-fragment">
                        Your profile is loaded, Archivist **{stats.username}**.
                        The next fragment awaits classification at Difficulty Tier **{stats.difficultyTier}**.
                    </p>
                </div>

                <div className="classifier-buttons start-round-container">
                    <button
                        className="button-primary begin-round-button"
                        onClick={() => {
                            setInitialLoadComplete(true);
                            startNewRound(stats.difficultyTier);
                        }}
                    >
                        Begin First Round (Generate Fragment)
                    </button>
                </div>
            </div>
        );
    }
    
    // --- RENDER LOGIC: Main Game UI ---
    return (
        <div className="game-container"> {/* Added fullscreen-layout class */}

            {/* Custom Error/Alert Modal */}
            {errorMessage && (
                <div className="custom-modal-overlay">
                    <div className="custom-modal-content">
                        <h3>{errorMessage.title}</h3>
                        <p>{errorMessage.message}</p>
                        <button onClick={() => setErrorMessage(null)} className="button-primary">Acknowledge</button>
                    </div>
                </div>
            )}

            {/* Header: Title and User Info */}
            <header className="game-header ribbon-layout">
                <div className="header-left ribbon-left">
                    <div className="title-block">
                        <span className="star-icon">✨</span>
                        <h1 className="game-title">ARCHIVIST OF MOIRAI</h1>
                    </div>
                    <div className="user-info-block">
                        <p className="welcome-text">Username: **{stats.username}**</p>
                        <p className="user-id">User ID: {user.uid.substring(0, 20)}...</p>
                    </div>
                </div>
                <div className="header-right ribbon-right">
                    <span className="sign-out-link button-primary" onClick={handleSignOut}>
                        Log Out
                    </span>
                </div>
            </header>

            {/* Metrics Tally */}
            <div className="metrics-tally">
                <div className="metric">
                    <span className="metric-icon">#</span>
                    <p className="metric-label">Total Rounds:</p>
                    <p className="metric-value">{totalRoundsPlayed}</p>
                </div>
                <div className="metric">
                    <span className="metric-icon">🎯</span>
                    <p className="metric-label">Round Attempts:</p>
                    <p className="metric-value">{(attemptCount % 5) + 1} / 5</p> {/* Display current attempt out of 5 */}
                </div>
                <div className="metric">
                    <span className="metric-icon">⚡</span>
                    <p className="metric-label">Current Score:</p>
                    <p className="metric-value">{stats.currentScore}</p>
                </div>
                <div className="metric">
                    <span className="metric-icon">⭐</span>
                    <p className="metric-label">Highest Score:</p>
                    <p className="metric-value">{stats.highestScore}</p>
                </div>
                <div className="metric">
                    <span className="metric-icon">❤</span>
                    <p className="metric-label">Current Streak:</p>
                    <p className="metric-value">{stats.currentStreak}</p>
                </div>
                <div className="metric">
                    <span className="metric-icon">🏆</span>
                    <p className="metric-label">Highest Streak:</p>
                    <p className="metric-value">{stats.highestStreak}</p>
                </div>
                <div className="metric">
                    <span className="metric-icon"> tier</span>
                    <p className="metric-label">Difficulty Tier:</p>
                    <p className="metric-value">{stats.difficultyTier}</p>
                </div>
            </div>

            {/* The Archival Scroll (Fragment Display) */}
            <div className="archival-scroll">
                <h3 className="scroll-title">The Archival Scroll (Fragment)</h3>
                <p className="scroll-fragment">
                    {(gameState === 'loading' || gameState === 'error')
                        ? "Accessing the Archival Stream..."
                        : currentFragment
                    }
                </p>
            </div>

            {/* The Classifier (Buttons) */}
            <div className="classifier">
                <h3 className="classifier-title">Classify the Causal Force:</h3>
                <div className="classifier-buttons">
                    {classifierOptions.map(option => (
                        <button
                            key={option}
                            className={`classifier-button ${userClassification === option ? 'selected' : ''}`}
                            onClick={() => handleClassification(option)}
                            disabled={gameState === 'revealing' || gameState === 'error' || gameState === 'loading'}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>

            {/* The Revelation Panel (Modal/Overlay) */}
            {(gameState === 'revealing' || gameState === 'error') && (
                <div className="revelation-overlay">
                    <div className="revelation-panel">
                        <h2 className={`revelation-header ${userClassification === secretTag ? 'correct' : 'incorrect'}`}>
                            {gameState === 'error'
                                ? '🛑 System Interruption'
                                : userClassification === secretTag
                                        ? '✅ Axiom Confirmed: Correct Classification'
                                        : '❌ Axiom Error: Narrative Deception Successful'
                            }
                        </h2>
                        
                        <div className="revelation-text-box">
                            <p className="revelation-focus">
                                The **True Causal Force** in this Fragment was: **{secretTag}**
                            </p>
                            <hr/>
                            <p className="revelation-justification">
                                **Revelation Text:** {revelationText}
                            </p>
                        </div>

                        <button
                            className="button-primary continue-button"
                            onClick={() => startNewRound(stats.difficultyTier)}
                        >
                            Continue to Next Fragment
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}