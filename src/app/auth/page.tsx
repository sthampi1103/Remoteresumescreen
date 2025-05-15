
// src/app/auth/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  PhoneAuthProvider,
  getMultiFactorResolver,
  PhoneMultiFactorGenerator,
  PhoneMultiFactorInfo,
  UserCredential,
  createUserWithEmailAndPassword,
  MultiFactorResolver,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { appInitialized, auth, authInitialized, appCheckInitialized } from '@/app/firebaseConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { Label } from '@/components/ui/label';

type AuthPageProps = {};

const AuthPage = ({}: AuthPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  const [isMFAPrompt, setIsMFAPrompt] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaHints, setMfaHints] = useState<PhoneMultiFactorInfo[]>([]);
  const [selectedMfaHint, setSelectedMfaHint] =
    useState<PhoneMultiFactorInfo | null>(null);
  const [mfaVerificationCode, setMfaVerificationCode] = useState('');
  const [isSendingMfaCode, setIsSendingMfaCode] = useState(false);
  const [isVerifyingMfaCode, setIsVerifyingMfaCode] = useState(false);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);
  // Store the widget ID in a ref to avoid re-renders triggering the effect unnecessarily
  const recaptchaWidgetIdRef = useRef<number | null>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);

  const router = useRouter();
  const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const isAuthSystemDisabled = loading || !authInitialized || !auth || (siteKeyProvided && !appCheckInitialized);


  useEffect(() => {
    // This effect handles displaying global initialization errors
    if (!appInitialized) {
      const msg = "Firebase core components are not yet initialized. Please wait or refresh. Inputs may be disabled.";
      if (!error) setError(msg);
      return;
    }
    if (!authInitialized && appInitialized) {
      const msg = "Firebase Authentication is initializing. Please wait. If this persists, check your Firebase setup and console for errors related to 'auth'. Inputs may be disabled.";
      if (!error) setError(msg);
    }

    if (authInitialized && siteKeyProvided && !appCheckInitialized) {
      const msg = "App Check Security Alert: Initialization failed even though a site key is provided. Key app functionalities (like login, signup, and AI features) will be disabled or will not work correctly. Inputs are disabled. " +
        "Please check the browser console for detailed error messages (e.g., 'appCheck/recaptcha-error', 'appCheck/fetch-status-error' or debug token issues). " +
        "Verify your reCAPTCHA Enterprise setup in Google Cloud & Firebase project settings (ensure domain is authorized, API is enabled, and site key is correct).";
      // Prioritize App Check error if it's relevant
      setError(msg);
    } else if (error && error.includes("App Check Security Alert") && appCheckInitialized) {
      // Clear App Check error if it gets initialized later
      setError(null);
    }
  }, [appInitialized, authInitialized, appCheckInitialized, siteKeyProvided, error]);


   useEffect(() => {
    // This effect specifically manages the reCAPTCHA verifier for MFA
    if (process.env.NODE_ENV !== 'production') {
      console.log("AuthPage: Recaptcha Verifier useEffect for MFA. NODE_ENV: development");
      console.log("AuthPage: In non-production environment. Clearing any existing reCAPTCHA verifier for MFA.");
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        setRecaptchaVerifier(null); // Triggers re-render, effect will re-evaluate dependencies
      }
      if (recaptchaContainerRef.current) {
        recaptchaContainerRef.current.innerHTML = '';
      }
      recaptchaWidgetIdRef.current = null;
      return;
    }

     // Conditions for setting up reCAPTCHA
     if (!authInitialized || !auth || !recaptchaContainerRef.current) {
       if (recaptchaVerifier) { // If verifier exists but conditions aren't met, clear it
         recaptchaVerifier.clear();
         setRecaptchaVerifier(null);
         if (recaptchaContainerRef.current) {
           recaptchaContainerRef.current.innerHTML = '';
         }
         recaptchaWidgetIdRef.current = null;
       }
       return;
     }

     // If verifier already exists and is valid, no need to re-create
     if (recaptchaVerifier) {
       return;
     }
    
     // Ensure container is empty before rendering (should be handled by clear, but as safeguard)
     if (recaptchaContainerRef.current && recaptchaContainerRef.current.innerHTML !== '') {
        console.warn("AuthPage: reCAPTCHA container was not empty. Clearing before render.");
        recaptchaContainerRef.current.innerHTML = '';
     }
     recaptchaWidgetIdRef.current = null; // Reset widget ID before new render attempt

      let instanceForThisEffect: RecaptchaVerifier | null = null;

      try {
         console.log("AuthPage: Initializing new RecaptchaVerifier for MFA phone auth...");
         instanceForThisEffect = new RecaptchaVerifier(auth,
           recaptchaContainerRef.current, // Container element
           {
             size: 'invisible', // Or 'normal' if you want a visible widget
             callback: (response: any) => {
                // reCAPTCHA solved, allow phone number verification.
                // This callback is usually for visible reCAPTCHA. Invisible often resolves render promise.
                console.log("AuthPage: reCAPTCHA (for MFA) solved with response:", response);
             },
             'expired-callback': () => {
                // Response expired. Ask user to solve reCAPTCHA again.
                setError("reCAPTCHA challenge expired. Please try the action again.");
                setIsSendingMfaCode(false); // Stop any pending operations
                setLoadingMessage(null);
                // Optionally, try to reset and re-render reCAPTCHA here
                if (instanceForThisEffect) {
                    instanceForThisEffect.clear();
                }
                if (recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
                recaptchaWidgetIdRef.current = null;
                setRecaptchaVerifier(null); // This will trigger the effect to re-run and attempt re-creation
             }
           }
         );
          
          console.log("AuthPage: New RecaptchaVerifier instance (for MFA) created:", instanceForThisEffect);
          setRecaptchaVerifier(instanceForThisEffect); // Store the new verifier

         instanceForThisEffect.render().then((widgetId) => {
            console.log(`AuthPage: reCAPTCHA (for MFA) rendered successfully with widget ID: ${widgetId}`);
            if (widgetId !== undefined && widgetId !== null) {
                 recaptchaWidgetIdRef.current = widgetId;
            }
         }).catch(renderError => {
            console.error("AuthPage: reCAPTCHA (for MFA) render error:", renderError);
            const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'your-deployed-domain.com';
            if (renderError.code === 'auth/network-request-failed') {
                let detailedMessage = `Failed to render reCAPTCHA for MFA (Error: auth/network-request-failed). This often means the browser could not load reCAPTCHA resources from Google (e.g., www.google.com/recaptcha, www.gstatic.com/recaptcha).`;
                detailedMessage += `\n\nTROUBLESHOOTING FOR DEPLOYED DOMAIN ('${currentHostname}'):`;
                detailedMessage += `\n1. **Domain Authorization in Google Cloud reCAPTCHA Console:** Ensure '${currentHostname}' (and its parent wildcard if applicable, e.g., 'us-central1.hosted.app' for 'xxxx.us-central1.hosted.app') is EXPLICITLY listed as an authorized domain for the reCAPTCHA key associated with your Firebase project.`;
                if (siteKeyProvided) {
                    detailedMessage += ` Since you are using a reCAPTCHA Enterprise key for App Check ('${process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY}'), verify this specific key's authorized domains in the Google Cloud Console. Note: MFA might use a different (non-Enterprise) reCAPTCHA key if you haven't explicitly configured Firebase Auth to use an Enterprise key for MFA.`;
                } else {
                    detailedMessage += ` Ensure the reCAPTCHA key used by Firebase Auth for MFA (usually a standard reCAPTCHA v2 invisible key created by Firebase or one you configured) has '${currentHostname}' authorized.`;
                }
                detailedMessage += `\n2. **reCAPTCHA API Enabled:** Confirm the 'reCAPTCHA API' (or standard reCAPTCHA API if not using Enterprise for MFA) is enabled in your Google Cloud project.`;
                detailedMessage += `\n3. **Network/Firewall/CSP:** Check for any network firewalls, corporate proxies, or restrictive Content Security Policies (CSP) on your deployed environment that might be blocking requests to Google's reCAPTCHA services.`;
                detailedMessage += `\n4. **Billing Account (for Enterprise):** Ensure your Google Cloud Project is linked to an active billing account if using reCAPTCHA Enterprise for MFA.`;
                detailedMessage += `\n\nOriginal error: ${renderError.message}`;
                setError(detailedMessage);
            } else if (renderError.message && renderError.message.toLowerCase().includes('recaptcha')) {
                 setError(`Failed to render reCAPTCHA for MFA (Error: ${renderError.code || 'unknown'}). This is often due to configuration issues or network problems. Please check: 1. Your domain ('${currentHostname}') is authorized for reCAPTCHA in Google Cloud. 2. The reCAPTCHA API is enabled. 3. Network connectivity to Google services (e.g., www.google.com/recaptcha, www.gstatic.com/recaptcha). Ensure no firewall, VPN, or ad-blocker is interfering. Detailed error: ${renderError.message}`);
            } else {
                setError("Failed to render reCAPTCHA for MFA. Phone authentication may fail. Check console for Firebase hints about 'already rendered' or other setup issues.");
            }
            // If render fails, clear the verifier to allow re-attempt on next effect run
            if(instanceForThisEffect) instanceForThisEffect.clear();
            setRecaptchaVerifier(null);
            if(recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
            recaptchaWidgetIdRef.current = null;
         });

      } catch (creationError: any) {
          console.error("AuthPage: RecaptchaVerifier creation error for MFA:", creationError);
          instanceForThisEffect = null; 
          // setRecaptchaVerifier(null); // Already null or will be from failed render
          const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'your-deployed-domain.com';
          if (creationError.code === 'auth/network-request-failed') {
            let detailedMessage = `Failed to initialize reCAPTCHA verifier for MFA due to a network error (Code: auth/network-request-failed). This means the Firebase SDK could not establish a connection required for reCAPTCHA.`;
            detailedMessage += `\n\nTROUBLESHOOTING FOR DEPLOYED DOMAIN ('${currentHostname}'):`;
            detailedMessage += `\n1. **Internet Connectivity:** Ensure the client machine has stable internet.`;
            detailedMessage += `\n2. **Domain Authorization for reCAPTCHA Key:** Ensure '${currentHostname}' (and its parent wildcard if applicable) is EXPLICITLY authorized for the reCAPTCHA key in your Google Cloud Console.`;
            if (siteKeyProvided) {
                detailedMessage += ` If using an Enterprise key for App Check ('${process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY}'), verify *that* key's domain list. However, MFA might use a standard reCAPTCHA key by default.`;
            }
            detailedMessage += `\n3. **Firewall/Proxy/Ad-blockers:** Check if any of these are blocking requests to Google services (www.google.com/recaptcha, www.gstatic.com/recaptcha).`;
            detailedMessage += `\n4. **Firebase Project/Google Cloud Config:** Verify overall Firebase and Google Cloud project health and reCAPTCHA API enablement.`;
            detailedMessage += `\n\nOriginal error: ${creationError.message}`;
            setError(detailedMessage);
          } else {
            setError("Failed to initialize reCAPTCHA verifier for MFA. Authentication involving phone may fail. Ensure only one reCAPTCHA container is present and it's correctly referenced.");
          }
          setRecaptchaVerifier(null); // Ensure state is reset
          if(recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
          recaptchaWidgetIdRef.current = null;
      }

     return () => {
        console.log("AuthPage: Cleanup for reCAPTCHA Verifier useEffect (MFA)");
        if (instanceForThisEffect) {
            console.log("AuthPage: Clearing reCAPTCHA verifier (MFA) instance from this effect run.");
            instanceForThisEffect.clear();
        }
        // Check if the currently stored verifier in state is the one from this effect run
        // This check helps prevent clearing a newer instance if the effect runs multiple times rapidly
        setRecaptchaVerifier(currentVerifier => {
            if (currentVerifier === instanceForThisEffect) {
                console.log("AuthPage: Cleared verifier from state matching this effect's instance.");
                return null; // Clear from state
            }
            console.log("AuthPage: Verifier in state did not match this effect's instance, not clearing from state (already cleared or newer instance).");
            return currentVerifier; // Otherwise, leave it (might be a newer instance or already null)
        });
         if (recaptchaContainerRef.current) {
             // Only clear innerHTML if the widget belongs to the verifier being cleared or if no verifier is set
             // This is tricky because widgetId is associated with an instance.
             // A simpler approach is to always clear, assuming the effect that creates a new one will re-render.
             recaptchaContainerRef.current.innerHTML = '';
             console.log("AuthPage: Cleared reCAPTCHA container (MFA).");
         }
         recaptchaWidgetIdRef.current = null;
     };
     // Dependencies for reCAPTCHA verifier setup for MFA
   }, [auth, authInitialized, siteKeyProvided]); // Removed recaptchaVerifier from deps


  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    
    console.log("AuthPage: Pre-Login App Check Status - siteKeyProvided:", siteKeyProvided, "appCheckInitialized:", appCheckInitialized);

    if (!authInitialized || !auth) {
      const msg = 'Firebase Authentication is not ready. Cannot proceed with login. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.';
      setError(msg);
      return;
    }
     
     if (siteKeyProvided && !appCheckInitialized) { 
       const msg = "App Check is not ready. Login cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).";
       setError(msg);
       return;
     }
    setLoading(true);
    setLoadingMessage('Logging in...');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setLoadingMessage('Login successful!');
      router.push('/'); 
    } catch (err: any) {
      setLoadingMessage(null);
      if (err instanceof FirebaseError) {

          if (err.code === 'auth/multi-factor-auth-required') {
              if (process.env.NODE_ENV !== 'production') {
                  console.warn("AuthPage: MFA is required by Firebase for this account. In a production environment, you would be prompted for a second factor. This prompt is skipped in non-production environments. User is NOT fully logged in.");
                  setError("MFA is required for this account. The MFA prompt is skipped in this non-production environment, and you will not be fully logged in. Configure your Firebase project or user settings if MFA is not desired for development/testing.");
              } else {
                  setError(null); // Clear previous errors before showing MFA prompt
                  try {
                       const resolver = getMultiFactorResolver(auth, err);
                       console.log("AuthPage: getMultiFactorResolver result:", resolver);
                       if (resolver) {
                         setMfaResolver(resolver);
                         const phoneHints = resolver.hints.filter(
                           (hint): hint is PhoneMultiFactorInfo => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
                         );
                         setMfaHints(phoneHints);
                         setIsMFAPrompt(true);
                         console.log("AuthPage: Available MFA hints:", phoneHints);
                       } else {
                          setError("Multi-factor authentication setup seems incomplete. Please try again or contact support.");
                          console.error("AuthPage: MFA resolver is null!");
                       }
                  } catch (resolverError: any) {
                       console.error("AuthPage: Error getting MFA resolver:", resolverError);
                       setError("Failed to process multi-factor authentication requirement.");
                  }
              }
          } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-email') {
              setError('Invalid credentials. Please check your email and password.');
          } else if (err.code === 'auth/network-request-failed') {
              setError('Login failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com, and www.google.com/recaptcha. 5. Visit status.firebase.google.com for service outages. App Check/reCAPTCHA loading failures can also cause this.');
          } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                let userFriendlyMessage = `Authentication failed due to a security check (${err.code}). `;
                if (err.code.includes('recaptcha-error')) { 
                    userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized in Google Cloud, reCAPTCHA Enterprise API not enabled, reCAPTCHA script blocked by network/firewall) or your network connection. Please try again or contact support. Check the browser console for more Firebase hints, especially logs from 'firebaseConfig.tsx'.";
                } else if (err.code.includes('fetch-status-error')) { 
                     userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization in Google Cloud for your reCAPTCHA key, ensure the correct site key is used in Firebase, and check API enablement. See console for detailed logs from 'firebaseConfig.tsx'.";
                }
                else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                    userFriendlyMessage += "Ensure App Check is configured correctly in Firebase Console (e.g., site key, debug token if local) and your environment is supported. Refreshing the page might help. Contact support if the issue persists. Check the browser console for Firebase hints from 'firebaseConfig.tsx'.";
                } else if (err.code.includes('app-not-authorized')) {
                    userFriendlyMessage += "This app is not authorized to use Firebase Authentication. Check your Firebase project setup, including authorized domains.";
                } else {
                     userFriendlyMessage += "Please try again. Check the browser console for details.";
                 }
                setError(userFriendlyMessage);
           } else {
              setError(`Login failed: ${err.message} (Code: ${err.code}). Please try again or contact support if the issue persists.`);
          }
      } else {
        setError('An unexpected error occurred during login. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    
    if (!authInitialized || !auth) {
      const msg = 'Firebase Authentication is not ready. Cannot proceed with sign up. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.';
      setError(msg);
      return;
    }
    
     if (siteKeyProvided && !appCheckInitialized) {
        const msg = "App Check is not ready. Sign up cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).";
        setError(msg);
        return;
     }
    setLoading(true);
    setLoadingMessage('Creating account...');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      if (tenantId.trim() !== '') {
        // In a real app, here you might:
        // 1. Call a Cloud Function to set custom claims (like tenantId) for the new user.
        // 2. Create a user document in Firestore within the specified tenant's collection.
        // For this demo, we'll just log it.
        console.log("AuthPage: User signed up with Tenant ID (for demo):", tenantId, "User UID:", userCredential.user.uid);
        // IMPORTANT: To actually use tenantId for data isolation, you'd need to set it as a custom claim
        // via the Firebase Admin SDK (typically in a Cloud Function triggered on user creation or called from client).
        // Example: admin.auth().setCustomUserClaims(userCredential.user.uid, { tenantId: tenantId });
        // Then, on the client, you'd refresh the ID token to get these claims.
      }

      setIsSignUp(false);
      setSuccessMessage('Account created successfully! Please log in.');
      setEmail('');
      setPassword('');
      setTenantId('');
    } catch (err: any) {
      setLoadingMessage(null);
        if (err instanceof FirebaseError) {
            if (err.code === 'auth/email-already-in-use') {
                setError('This email address is already registered. Please log in or use a different email.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak. Please choose a stronger password (at least 6 characters).');
            } else if (err.code === 'auth/invalid-email') {
                setError('Invalid email address format.');
            } else if (err.code === 'auth/network-request-failed') {
                 setError('Sign up failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com, and www.google.com/recaptcha. 5. Visit status.firebase.google.com for service outages. App Check/reCAPTCHA loading failures can also cause this.');
            } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                 let userFriendlyMessage = `Sign up failed due to a security check (${err.code}). `;
                 if (err.code.includes('recaptcha-error')) {
                    userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized, API not enabled, reCAPTCHA script blocked by network/firewall) or your network. Please try again or contact support. Check browser console for Firebase hints from 'firebaseConfig.tsx'.";
                 } else if (err.code.includes('fetch-status-error')) {
                     userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization, site key, and API enablement. See console for logs from 'firebaseConfig.tsx'.";
                 }
                  else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                     userFriendlyMessage += "Ensure App Check is configured correctly. Refreshing might help. Contact support if issues persist. Check browser console for Firebase hints from 'firebaseConfig.tsx'.";
                 } else if (err.code.includes('app-not-authorized')) {
                     userFriendlyMessage += "This app is not authorized for sign-up. Check Firebase project setup.";
                 } else {
                     userFriendlyMessage += "Please try again. Check the browser console for details.";
                 }
                 setError(userFriendlyMessage);
            } else {
                setError(`Sign up failed: ${err.message} (Code: ${err.code}). Please try again or contact support if the issue persists.`);
            }
        } else {
            setError('An unexpected error occurred during sign up. Please try again.');
        }
    } finally {
      setLoading(false);
    }
  };

  const handleSendMfaCode = async () => {
      if (process.env.NODE_ENV !== 'production') {
          setError("MFA code sending is disabled in non-production environments.");
          console.warn("AuthPage: Attempted to send MFA code in non-production environment. Aborting.");
          return;
      }

      if (!selectedMfaHint || !mfaResolver) {
          const msg = "Could not initiate MFA verification. Select a phone number and try again. Selected hint or MFA resolver is missing.";
          setError(msg);
          console.error("AuthPage: MFA Send Code Error - Missing selectedMfaHint or mfaResolver.", "Selected Hint:", selectedMfaHint, "Resolver:", mfaResolver);
          return;
      }
      if (!recaptchaVerifier) {
           const msg = "reCAPTCHA verifier (for MFA) is not ready. Please wait and try again. If this persists, ensure the reCAPTCHA container is visible and there are no console errors related to its rendering (e.g., network blocks to www.google.com/recaptcha or www.gstatic.com/recaptcha). Check Firebase/GCP console for domain authorization & API settings for reCAPTCHA.";
           setError(msg);
           console.error("AuthPage: MFA Send Code Error - recaptchaVerifier not ready.");
           return;
      }
       
       if (siteKeyProvided && !appCheckInitialized) {
         const msg = "App Check is not ready. MFA code sending cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error' from 'firebaseConfig.tsx'.";
         setError(msg);
         console.error("AuthPage: MFA Send Code Error - App Check not ready.");
         return;
       }

      setError(null);
      setIsSendingMfaCode(true);
      setLoadingMessage('Sending verification code...');
      console.log("AuthPage: Sending MFA code to:", selectedMfaHint.phoneNumber, "using verifier:", recaptchaVerifier);

      try {
          if (!auth) throw new Error("Firebase Auth not initialized for MFA.");
          const phoneInfoOptions = {
              multiFactorHint: selectedMfaHint,
              session: mfaResolver.session
          };
          const phoneAuthProvider = new PhoneAuthProvider(auth);

          const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
           setMfaVerificationId(verificationId);
           setLoadingMessage('Verification code sent. Enter the code below.');
           console.log("AuthPage: MFA verification ID obtained:", verificationId);

      } catch (err: any) {
          console.error("AuthPage: MFA Send Code Error - verifyPhoneNumber failed:", err);
          if (err instanceof FirebaseError) {
              if (err.code === 'auth/network-request-failed') {
                   setError('Failed to send verification code due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com, and www.google.com/recaptcha. 5. Visit status.firebase.google.com for service outages. App Check/reCAPTCHA loading failures can also cause this.');
              } else if (err.code.includes('recaptcha') || err.code.includes('app-check') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                   let userFriendlyMessage = `Failed to send verification code due to a security check (${err.code}). `;
                     if (err.code.includes('recaptcha-error')) {
                         userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized, API not enabled, reCAPTCHA container not rendered, reCAPTCHA script blocked by network/firewall) or your network. Please try again or contact support. Check browser console for Firebase hints (from 'firebaseConfig.tsx' if App Check is involved).";
                     } else if (err.code.includes('fetch-status-error')) {
                        userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization, site key, and API enablement. See console for logs from 'firebaseConfig.tsx'.";
                     }
                     else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                         userFriendlyMessage += "Ensure App Check is configured correctly. Refreshing might help. Contact support if issues persist. Check browser console for Firebase hints from 'firebaseConfig.tsx'.";
                     } else if (err.code.includes('app-not-authorized')) {
                         userFriendlyMessage += "This app is not authorized for this operation. Check Firebase project setup.";
                     } else {
                          userFriendlyMessage += "Please try again. Check the browser console for details.";
                      }
                     setError(userFriendlyMessage);
              } else if (err.code === 'auth/invalid-phone-number') {
                   setError("Invalid phone number format provided for MFA.");
              } else if (err.code === 'auth/too-many-requests') {
                   setError("Too many verification code requests. Please wait a while before trying again.");
              } else if (err.code === 'auth/code-expired' || err.message.toLowerCase().includes('recaptcha check already in progress') || err.code === 'auth/missing-phone-number' ) {
                   setError("Verification attempt failed. This could be due to an expired reCAPTCHA, a reCAPTCHA check already in progress, or a missing phone number. Please try sending the code again.");
                   if (recaptchaVerifier && process.env.NODE_ENV === 'production') {
                       recaptchaVerifier.clear();
                       setRecaptchaVerifier(null);
                       if (recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
                       recaptchaWidgetIdRef.current = null;
                   }
                   setSelectedMfaHint(null); // Reset hint selection
                   setMfaVerificationId(null); // Reset verification ID
              } else {
                   setError(`Failed to send verification code: ${err.message} (Code: ${err.code}). Please try again or contact support.`);
              }
          } else {
              setError(`Failed to send verification code: An unexpected error occurred (${err.message}). Please try again.`);
          }
          setLoadingMessage(null);
      } finally {
          setIsSendingMfaCode(false);
           // Reset reCAPTCHA for the next attempt, especially if it's invisible
           // This part ensures the reCAPTCHA is reset *after* verifyPhoneNumber has completed or failed.
           if (process.env.NODE_ENV === 'production' && recaptchaVerifier && recaptchaContainerRef.current && recaptchaWidgetIdRef.current !== null) {
               try {
                   // @ts-ignore
                   if (typeof window !== 'undefined' && window.grecaptcha && typeof window.grecaptcha.reset === 'function') {
                       // @ts-ignore
                       window.grecaptcha.reset(recaptchaWidgetIdRef.current);
                       console.log("AuthPage: Explicitly reset reCAPTCHA widget:", recaptchaWidgetIdRef.current);
                   }
                   // It's generally better to clear and nullify the verifier to force re-creation for a fresh attempt
                   recaptchaVerifier.clear();
                   setRecaptchaVerifier(null);
                   recaptchaContainerRef.current.innerHTML = '';
                   recaptchaWidgetIdRef.current = null;
                   console.log("AuthPage: Cleared and nullified reCAPTCHA verifier after send code attempt.");

               } catch (e) {
                   console.error("AuthPage: Error resetting reCAPTCHA widget or clearing verifier:", e);
               }
           }
      }
  };


  const handleVerifyMfaCode = async () => {
      if (process.env.NODE_ENV !== 'production') {
        setError("MFA code verification is disabled in non-production environments.");
        console.warn("AuthPage: Attempted to verify MFA code in non-production environment. Aborting.");
        return;
      }

      if (!mfaVerificationCode || !mfaResolver || !mfaVerificationId) {
          const msg = "Missing information to verify the code. Please request a new code and try again. Verification code, resolver, or verification ID is missing.";
          setError(msg);
          console.error("AuthPage: MFA Verify Code Error - Missing code, resolver, or verificationId.", "Code:", mfaVerificationCode, "Resolver:", mfaResolver, "VerificationId:", mfaVerificationId);
          return;
      }
      
      if (siteKeyProvided && !appCheckInitialized) {
        const msg = "App Check is not ready. MFA code verification cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error' from 'firebaseConfig.tsx'.";
        setError(msg);
        console.error("AuthPage: MFA Verify Code Error - App Check not ready.");
        return;
      }

      setError(null);
      setIsVerifyingMfaCode(true);
      setLoadingMessage('Verifying code...');
      console.log("AuthPage: Verifying MFA code:", mfaVerificationCode, "with resolver:", mfaResolver, "verificationId:", mfaVerificationId);

      try {
          const cred = PhoneMultiFactorGenerator.assertion(
              mfaVerificationId,
              mfaVerificationCode
          );
          const userCredential = await mfaResolver.resolveSignIn(cred);
          setLoadingMessage('Login successful!');
          console.log("AuthPage: MFA Login successful for user:", userCredential.user.uid);
          router.push('/'); 

      } catch (err: any) {
           console.error("AuthPage: MFA Verify Code Error - resolveSignIn failed:", err);
           if (err instanceof FirebaseError) {
                if (err.code === 'auth/invalid-verification-code') {
                   setError("Invalid verification code. Please try again.");
                } else if (err.code === 'auth/code-expired') {
                     setError("Verification code has expired. Please request a new one.");
                     // Reset state to allow user to request a new code
                     setMfaVerificationId(null);
                     setMfaVerificationCode('');
                     // setSelectedMfaHint(null); // Keep selected hint to avoid re-selection unless desired
                     setLoadingMessage(null);
                     // It's crucial to reset reCAPTCHA here as well to allow a fresh attempt
                     if (recaptchaVerifier && process.env.NODE_ENV === 'production') {
                        // @ts-ignore
                        if (typeof window !== 'undefined' && window.grecaptcha && recaptchaWidgetIdRef.current !== null && typeof window.grecaptcha.reset === 'function') {
                            try {
                                // @ts-ignore
                                window.grecaptcha.reset(recaptchaWidgetIdRef.current);
                                console.log("AuthPage: Explicitly reset reCAPTCHA widget on code expired error:", recaptchaWidgetIdRef.current);
                            } catch (e) {
                                 console.error("AuthPage: Error resetting reCAPTCHA widget on code expired:", e);
                            }
                        }
                        recaptchaVerifier.clear();
                        setRecaptchaVerifier(null);
                        if (recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
                        recaptchaWidgetIdRef.current = null;
                        console.log("AuthPage: Cleared and nullified reCAPTCHA verifier on code expired.");
                     }
                } else if (err.code === 'auth/network-request-failed') {
                     setError('MFA verification failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, firebaseappcheck.googleapis.com. 5. Visit status.firebase.google.com.');
                } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                    let userFriendlyMessage = `MFA verification failed due to a security check (${err.code}). `;
                      if (err.code.includes('recaptcha-error')) {
                          userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized, API not enabled, reCAPTCHA script blocked by network/firewall) or your network. Please try again or contact support. Check browser console for Firebase hints from 'firebaseConfig.tsx'.";
                      } else if (err.code.includes('fetch-status-error')) {
                         userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization, site key, and API enablement. See console for logs from 'firebaseConfig.tsx'.";
                      }
                       else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                          userFriendlyMessage += "Ensure App Check is configured correctly. Refreshing might help. Contact support if issues persist. Check browser console for Firebase hints from 'firebaseConfig.tsx'.";
                      } else if (err.code.includes('app-not-authorized')) {
                           userFriendlyMessage += "This app is not authorized for this operation. Check Firebase project setup.";
                      } else {
                          userFriendlyMessage += "Please try again. Check the browser console for details.";
                      }
                     setError(userFriendlyMessage);
                } else {
                     setError(`MFA verification failed: ${err.message} (Code: ${err.code}). Please try again or contact support.`);
                 }
           } else {
                setError(`An unexpected error occurred during MFA verification (${err.message}). Please try again.`);
           }
          setLoadingMessage(null);
      } finally {
          setIsVerifyingMfaCode(false);
      }
  };

  const handleForgotPasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    
    if (!authInitialized || !auth) {
      const msg = 'Firebase Authentication is not ready. Cannot send password reset email. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.';
      setError(msg);
      return;
    }
     
     if (siteKeyProvided && !appCheckInitialized) {
       const msg = "App Check is not ready. Password reset cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).";
       setError(msg);
       return;
     }
    setLoading(true);
    setLoadingMessage('Sending password reset email...');

    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage(
        `Password reset email sent to ${email}. Please check your inbox (and spam folder).`
      );
      setIsForgotPassword(false);
      setEmail(''); // Clear email after sending
    } catch (err: any) {
       setLoadingMessage(null);
       if (err instanceof FirebaseError) {
           if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
               setError(
                   'Email address not found or is invalid. Please enter a registered email address.'
               );
           } else if (err.code === 'auth/network-request-failed') {
                setError('Password reset failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, firebaseappcheck.googleapis.com. 5. Visit status.firebase.google.com for service outages.');
           } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                let userFriendlyMessage = `Password reset failed due to a security check (${err.code}). `;
                 if (err.code.includes('recaptcha-error')) {
                     userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized, API not enabled, reCAPTCHA script blocked by network/firewall) or your network. Please try again or contact support. Check browser console for Firebase hints from 'firebaseConfig.tsx'.";
                 } else if (err.code.includes('fetch-status-error')) {
                    userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization, site key, and API enablement. See console for logs from 'firebaseConfig.tsx'.";
                 }
                 else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                     userFriendlyMessage += "Ensure App Check is configured correctly. Refreshing might help. Contact support if issues persist. Check browser console for Firebase hints from 'firebaseConfig.tsx'.";
                 } else if (err.code.includes('app-not-authorized')) {
                    userFriendlyMessage += "This app is not authorized for password reset. Check Firebase project setup.";
                 } else {
                     userFriendlyMessage += "Please try again. Check the browser console for details.";
                 }
                 setError(userFriendlyMessage);
           } else {
               setError(
                   `An error occurred sending the password reset email: ${err.message} (Code: ${err.code}). Please try again or contact support.`
               );
           }
       } else {
            setError(`An unexpected error occurred during password reset (${err.message}). Please try again.`);
       }
    } finally {
      setLoading(false);
    }
  };

  const resetAuthState = () => {
    setError(null);
    setSuccessMessage(null);
    // Do not clear email/password here, user might want to retry with same credentials
    // setEmail('');
    // setPassword('');
    // setTenantId(''); // Keep tenantId if set by user
    setIsMFAPrompt(false);
    setMfaResolver(null);
    setMfaHints([]);
    setSelectedMfaHint(null);
    setMfaVerificationCode('');
    setMfaVerificationId(null);
    setLoadingMessage(null); // Clear loading message
    // Reset reCAPTCHA if it was used
    if (recaptchaVerifier && process.env.NODE_ENV === 'production') {
      recaptchaVerifier.clear();
      setRecaptchaVerifier(null);
      if (recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
      recaptchaWidgetIdRef.current = null;
    }
  };

  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp);
    setIsForgotPassword(false); // Ensure forgot password is not shown
    resetAuthState(); // Reset MFA related state
    setEmail(''); // Clear email and password when switching modes
    setPassword('');
    // setTenantId(''); // Optionally clear tenantId or keep
  };

  const showForgotPassword = () => {
    setIsForgotPassword(true);
    setIsSignUp(false); // Ensure sign up is not shown
    resetAuthState();
    // setEmail(''); // Keep email if user typed it for login attempt
    setPassword(''); // Clear password
  };

  const showLogin = () => {
    setIsForgotPassword(false);
    setIsSignUp(false);
    resetAuthState();
    // Keep email/password if user was on forgot/signup and wants to go back to login
  };
  
  if (typeof window !== 'undefined') {
    // For client-side specific logic if needed, e.g., checking window properties
    // console.log("AuthPage: Window object is available.");
  }


  return (
    <div className="flex justify-center items-center min-h-screen bg-muted/40 p-4">
      <div className="bg-card text-card-foreground p-6 sm:p-8 rounded-lg shadow-lg w-full max-w-md border">
        {/* Debug Log for isAuthSystemDisabled */}
        {/* <p>Debug: isAuthSystemDisabled: {isAuthSystemDisabled.toString()}</p> */}

        {loading && loadingMessage && (
          <Alert variant="default" className="mb-4 bg-blue-50 border-blue-200 text-blue-700">
            <Icons.loader className="h-4 w-4 animate-spin text-blue-700" />
            <AlertTitle>Processing...</AlertTitle>
            <AlertDescription suppressHydrationWarning={true}>
              {loadingMessage}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <Icons.alertCircle className="h-4 w-4" />
            <AlertTitle>{isSignUp ? 'Sign Up Error' : isForgotPassword ? 'Reset Password Error' : isMFAPrompt ? 'MFA Error' : error.toLowerCase().includes("app check") || error.toLowerCase().includes("security alert") || error.toLowerCase().includes("core components") || error.toLowerCase().includes("authentication is initializing") ? 'Security/Initialization Error' : 'Login Error'}</AlertTitle>
            <AlertDescription suppressHydrationWarning={true} className="whitespace-pre-wrap">{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert variant="default" className="mb-4 bg-green-50 border-green-200 text-green-700">
            <Icons.check className="h-4 w-4 text-green-700" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription suppressHydrationWarning={true}>{successMessage}</AlertDescription>
          </Alert>
        )}

        {!isMFAPrompt && !isForgotPassword && !isSignUp && (
          <>
            <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
            <form onSubmit={handleLoginSubmit}>
              <div className="mb-4">
                <Label className="block text-sm font-medium mb-2" htmlFor="email-login">Email</Label>
                <Input
                  className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                  id="email-login" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required disabled={isAuthSystemDisabled} suppressHydrationWarning={true}
                />
              </div>
              <div className="mb-6">
                <Label className="block text-sm font-medium mb-2" htmlFor="password-login">Password</Label>
                <Input
                  className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                  id="password-login" type="password" placeholder="••••••••" value={password}
                  onChange={(e) => setPassword(e.target.value)} required disabled={isAuthSystemDisabled} suppressHydrationWarning={true}
                />
              </div>
              <div className="flex items-center justify-between mb-4">
                <Button className="w-full" type="submit" disabled={isAuthSystemDisabled || loading} suppressHydrationWarning={true}>
                  {loading && !loadingMessage ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.login className="mr-2 h-4 w-4" />}
                  Login
                </Button>
              </div>
              <div className="text-center space-y-2">
                <Button type="button" variant="link" onClick={showForgotPassword} className="text-sm" disabled={isAuthSystemDisabled} suppressHydrationWarning={true}>
                  Forgot Password?
                </Button>
                 <p className="text-sm text-muted-foreground">
                   Don't have an account?{' '}
                   <Button type="button" variant="link" onClick={toggleAuthMode} className="text-sm p-0 h-auto" disabled={isAuthSystemDisabled} suppressHydrationWarning={true}>
                     Sign Up
                   </Button>
                 </p>
              </div>
            </form>
          </>
        )}

        {isSignUp && (
          <>
            <h2 className="text-2xl font-bold mb-6 text-center">Create Account</h2>
            <form onSubmit={handleSignUpSubmit}>
              <div className="mb-4">
                  <Label className="block text-sm font-medium mb-2" htmlFor="email-signup">Email</Label>
                  <Input
                    className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                    id="email-signup" type="email" placeholder="you@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required disabled={isAuthSystemDisabled} suppressHydrationWarning={true}
                  />
              </div>
              <div className="mb-4">
                  <Label className="block text-sm font-medium mb-2" htmlFor="password-signup">Password</Label>
                  <Input
                    className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                    id="password-signup" type="password" placeholder="Choose a strong password" value={password}
                    onChange={(e) => setPassword(e.target.value)} required disabled={isAuthSystemDisabled} suppressHydrationWarning={true}
                  />
              </div>
               <div className="mb-6">
                  <Label className="block text-sm font-medium mb-2" htmlFor="tenant-id-signup">
                    Tenant ID (Optional for Demo)
                  </Label>
                  <Input
                    className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                    id="tenant-id-signup" type="text" placeholder="Enter your organization's Tenant ID" value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)} disabled={isAuthSystemDisabled} suppressHydrationWarning={true}
                  />
                   <p className="text-xs text-muted-foreground mt-1">
                    In a multi-tenant app, this ID associates you with your organization. For a real system, this would be verified.
                  </p>
              </div>
              <div className="flex items-center justify-between mb-4">
                <Button className="w-full" type="submit" disabled={isAuthSystemDisabled || loading} suppressHydrationWarning={true}>
                  {loading && !loadingMessage ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.user className="mr-2 h-4 w-4" />}
                  Sign Up
                </Button>
              </div>
              <div className="text-center">
                 <p className="text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <Button type="button" variant="link" onClick={showLogin} className="text-sm p-0 h-auto" disabled={isAuthSystemDisabled} suppressHydrationWarning={true}>
                      Login
                    </Button>
                  </p>
              </div>
            </form>
          </>
        )}

        {isForgotPassword && (
          <>
            <h2 className="text-2xl font-bold mb-6 text-center">Reset Password</h2>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Enter your registered email address below and we'll send you a link to reset your password.
            </p>
            <form onSubmit={handleForgotPasswordSubmit}>
              <div className="mb-4">
                <Label className="block text-sm font-medium mb-2" htmlFor="email-forgot">Email</Label>
                <Input
                  className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                  id="email-forgot" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required disabled={isAuthSystemDisabled} suppressHydrationWarning={true}
                />
              </div>
              <div className="flex items-center justify-between mb-4">
                <Button className="w-full" type="submit" disabled={isAuthSystemDisabled || loading} suppressHydrationWarning={true}>
                  {loading && !loadingMessage ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.mail className="mr-2 h-4 w-4" />}
                  Send Reset Link
                </Button>
              </div>
              <div className="text-center">
                <Button type="button" variant="link" onClick={showLogin} className="text-sm" disabled={isAuthSystemDisabled} suppressHydrationWarning={true}>
                  Back to Login
                </Button>
              </div>
            </form>
          </>
        )}

        {isMFAPrompt && process.env.NODE_ENV === 'production' && (
          <>
            <h2 className="text-2xl font-bold mb-6 text-center">Multi-Factor Authentication</h2>
            {!selectedMfaHint && mfaHints.length > 0 && !mfaVerificationId && (
               <>
                 <p className="text-sm text-muted-foreground mb-4 text-center">
                   Select a phone number to receive your verification code.
                 </p>
                 <div className="space-y-2 mb-4">
                   {mfaHints.map((hint) => (
                     <Button
                       key={hint.uid}
                       variant="outline"
                       className="w-full justify-start"
                       onClick={() => {
                        setSelectedMfaHint(hint);
                        console.log("AuthPage: MFA Hint selected:", hint);
                       }}
                       disabled={isSendingMfaCode || isAuthSystemDisabled} suppressHydrationWarning={true}
                     >
                       <Icons.messageSquare className="mr-2 h-4 w-4" />
                       {hint.displayName || `Phone ending in ...${hint.phoneNumber?.slice(-4)}`}
                     </Button>
                   ))}
                 </div>
                 <div className="flex items-center justify-between mb-4">
                      <Button
                        className="w-full"
                        type="button"
                        onClick={handleSendMfaCode}
                        disabled={!selectedMfaHint || isSendingMfaCode || !recaptchaVerifier || isAuthSystemDisabled || loading}
                        suppressHydrationWarning={true}
                       >
                         {isSendingMfaCode ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.messageSquare className="mr-2 h-4 w-4" />}
                         Send Code to Selected Number
                       </Button>
                 </div>
               </>
            )}

             {!selectedMfaHint && mfaHints.length === 0 && !mfaVerificationId && (
                 <Alert variant="destructive" className="mb-4">
                     <Icons.alertCircle className="h-4 w-4" />
                     <AlertTitle>MFA Setup Required</AlertTitle>
                     <AlertDescription suppressHydrationWarning={true}>
                        Multi-factor authentication is required, but you haven't set up a second factor (like a phone number) yet. Please contact support or your administrator to enroll a second factor.
                     </AlertDescription>
                 </Alert>
             )}

             {mfaVerificationId && (
               <>
                 <p className="text-sm text-muted-foreground mb-4 text-center">
                   Enter the 6-digit code sent to your selected phone number.
                 </p>
                  <form onSubmit={(e) => { e.preventDefault(); handleVerifyMfaCode(); }}>
                       <div className="mb-6">
                           <Label className="block text-sm font-medium mb-2" htmlFor="mfa-code">Verification Code</Label>
                           <Input
                             className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                             id="mfa-code" type="text" inputMode="numeric" pattern="[0-9]{6}"
                             placeholder="Enter 6-digit code" value={mfaVerificationCode}
                             onChange={(e) => setMfaVerificationCode(e.target.value)} required
                             disabled={isVerifyingMfaCode || isAuthSystemDisabled} suppressHydrationWarning={true}
                           />
                       </div>
                       <div className="flex items-center justify-between mb-4">
                           <Button
                             className="w-full"
                             type="submit"
                             disabled={isVerifyingMfaCode || isAuthSystemDisabled || loading}
                             suppressHydrationWarning={true}
                           >
                             {isVerifyingMfaCode ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.check className="mr-2 h-4 w-4" />}
                             Verify Code & Login
                           </Button>
                       </div>
                        <div className="text-center text-sm">
                            <Button
                                type="button"
                                variant="link"
                                onClick={() => {
                                    console.log("AuthPage: User requested new MFA code / reset MFA state.");
                                    setMfaVerificationId(null); // Clear verification ID
                                    setSelectedMfaHint(null); // Clear selected hint to re-select
                                    setMfaVerificationCode(''); // Clear entered code
                                    setError(null); // Clear previous errors
                                    setLoadingMessage(null); // Clear loading message
                                    // Crucially, reset reCAPTCHA to allow a fresh challenge
                                    if (recaptchaVerifier && process.env.NODE_ENV === 'production') {
                                      recaptchaVerifier.clear();
                                      setRecaptchaVerifier(null); // This will trigger the useEffect to re-create it
                                      if (recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
                                      recaptchaWidgetIdRef.current = null;
                                      console.log("AuthPage: Cleared and nullified reCAPTCHA verifier for new code request.");
                                    }
                                }}
                                disabled={isSendingMfaCode || isVerifyingMfaCode || isAuthSystemDisabled}
                                suppressHydrationWarning={true}
                            >
                                Request a new code
                            </Button>
                        </div>
                  </form>
               </>
             )}

            <div className="text-center mt-4">
                <Button type="button" variant="link" onClick={() => {
                    console.log("AuthPage: User cancelled MFA / backed to Login.");
                    showLogin(); // This already calls resetAuthState which handles reCAPTCHA
                }} className="text-sm" disabled={isAuthSystemDisabled && !isMFAPrompt} suppressHydrationWarning={true}>
                  Cancel MFA / Back to Login
                </Button>
            </div>
          </>
        )}

         
         {process.env.NODE_ENV === 'production' && <div ref={recaptchaContainerRef} id="recaptcha-container-mfa" className="my-4" suppressHydrationWarning={true}></div>}

      </div>
    </div>
  );
};

export default AuthPage;
    

      