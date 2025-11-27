// Registration.jsx
import React, { useState, useEffect } from "react";
import { 
    signInWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider, 
    createUserWithEmailAndPassword,
    onAuthStateChanged, // <-- ADDED: For real-time auth state management
    signOut // <-- ADDED: for cleaner logout
} from "firebase/auth";
import { 
    doc, 
    setDoc,
    getDoc,
    updateDoc // <-- ADDED: for updating user stats
} from "firebase/firestore";

import { auth, db } from "../../firebase.js"; 
import { Game } from "../Game/Game.jsx"; // <-- NEW: Import the main game component

// Export the component so it can be imported in main.jsx
export function Registration() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [isRegistering, setIsRegistering] = useState(false);
    const [message, setMessage] = useState({ text: "", type: "" });
    const [isLoading, setIsLoading] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(null); // Will hold the user object or null

    const googleProvider = new GoogleAuthProvider();

    // --- AUTH STATE LISTENER (THE CORE GUARD) ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setIsAuthenticated(user);
            setIsLoading(false); // Stop loading once state is determined
        });
        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    // Derived values for dynamic UI elements
    const formTitle = isRegistering ? 'Enroll in the Archives' : 'Enter the Athenaeum';
    const mainActionText = isRegistering ? 'Sign Up' : 'Log In';
    const toggleText = isRegistering ? 'Already a member? ' : 'New to the Athenaeum? ';
    const toggleLinkText = isRegistering ? 'Log In' : 'Sign Up';
    const messageClass = `message-box ${message.type}`;

    // --- LOGIC FOR EMAIL/PASSWORD SIGN UP/LOG IN ---
    const handleEmailPasswordSubmit = async (e) => {
        e.preventDefault();
        setMessage({ text: "", type: "" });
        setIsLoading(true);

        try {
            if (isRegistering) {
                // SIGN UP LOGIC
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // Create a user profile document in Firestore
                await setDoc(doc(db, "users", user.uid), {
                    email: user.email,
                    username: username,
                    currentScore: 0,
                    currentStreak: 0,
                    highestStreak: 0,  
                    difficultyTier: 1, 
                    joinedDate: new Date().toISOString()
                });
                
                setMessage({ text: "Registration successful! Please Log In.", type: "success" });
                setIsRegistering(false); 
                
            } else {
                // LOG IN LOGIC
                await signInWithEmailAndPassword(auth, email, password);
                // Auth state listener handles setting isAuthenticated
                setMessage({ text: `Welcome back, Archivist!`, type: "success" });
            }
        } catch (error) {
            console.error("Auth error:", error);
            const errorMessage = error.code ? error.code.replace('auth/', '').replace(/-/g, ' ') : error.message;
            setMessage({ text: `Error: ${errorMessage}.`, type: "error" });
        } finally {
            setIsLoading(false);
        }
    }

    // --- LOGIC FOR GOOGLE SIGN IN/SIGN UP ---
    const handleGoogleLogIn = async () => {
        setMessage({ text: "", type: "" });
        setIsLoading(true);
        try {
            const userCredential = await signInWithPopup(auth, googleProvider);
            const user = userCredential.user;

            const userDocRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userDocRef);

            if (!docSnap.exists()) {
                // Create profile for new Google user
                await setDoc(userDocRef, {
                    email: user.email,
                    username: user.displayName || 'The Archivist',
                    currentScore: 0,
                    currentStreak: 0,
                    highestStreak: 0,
                    difficultyTier: 1, 
                    joinedDate: new Date().toISOString()
                });
            }
            // Auth state listener handles setting isAuthenticated
        } catch (error) {
            console.error("Google Auth error:", error);
            const errorMessage = error.code ? error.code.replace('auth/', '').replace(/-/g, ' ') : error.message;
            setMessage({ text: `Google Sign-in Error: ${errorMessage}.`, type: "error" });
        } finally {
            setIsLoading(false);
        }
    }

    // --- SIGN OUT HANDLER ---
    const handleSignOut = async () => {
        await signOut(auth); // Use imported signOut
        setMessage({ text: 'Successfully logged out. Farewell, Archivist.', type: 'success' });
    }

    // --- UI TOGGLE HANDLER ---
    const toggleMode = () => {
        setIsRegistering(!isRegistering);
        setMessage({ text: "", type: "" });
        setEmail("");
        setPassword("");
        setUsername("");
    }
    
    // --- RENDER LOGIC ---
    if (isAuthenticated) {
        // If authenticated, render the main game
        return <Game user={isAuthenticated} onSignOut={handleSignOut} />;
    }

    // If still checking auth state, show a loading spinner (or just the form with disabled state)
    // The useEffect hook handles the initial check. If it's null, we render the form.
    
    return (
        <div className="login-container"> 
            
            {/* Message/Error Display Box */}
            {message.text && (
                <div className={messageClass}>
                    {message.text}
                </div>
            )}
            
            {/* Login/Registration Form */}
            <div className="form-wrapper">
                <h1 className="header-title">{formTitle}</h1>
                <p className="header-subtitle">Archivist of Moirai</p>
                
                <form onSubmit={handleEmailPasswordSubmit}> 
                    {/* ... (Input groups for email, username, password) ... (Same as your original JSX) */}
                    <div className="input-group">
                        <span className="input-icon">✉</span> 
                        <label htmlFor="email">Email</label>
                        <input type="email" id="email" placeholder="Archivist Email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
                    </div>
                    {isRegistering && (
                        <div className="input-group">
                            <span className="input-icon">👤</span> 
                            <label htmlFor="username">Username</label>
                            <input type="text" id="username" placeholder="Desired Username" required value={username} onChange={(e) => setUsername(e.target.value)} disabled={isLoading} />
                        </div>
                    )}
                    <div className="input-group">
                        <span className="input-icon">🔑</span> 
                        <label htmlFor="password">Cipher Key</label>
                        <input type="password" id="password" placeholder="Cipher Key" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
                    </div>
                    
                    <button 
                        type="submit" 
                        className="button-primary"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Processing...' : mainActionText}
                    </button>
                </form>

                <button 
                    onClick={handleGoogleLogIn} 
                    className="button-primary google-button"
                    disabled={isLoading}
                >
                    Continue with Google
                </button>
                
                <div className="toggle-text">
                    <span>{toggleText}</span>
                    <span 
                        className="toggle-link" 
                        onClick={toggleMode}
                    >
                        {toggleLinkText}
                    </span>
                </div>
            </div>
        </div>
    );
}