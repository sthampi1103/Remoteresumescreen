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

type AuthPageProps = {};

const AuthPage = ({}: AuthPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
  const [recaptchaWidgetId, setRecaptchaWidgetIdInternal] = useState<number | null>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);

  const router = useRouter();

  const setRecaptchaWidgetId = (id: number | null) => {
    //console.log("AuthPage: Setting reCAPTCHA widget ID (for MFA):", id);
    setRecaptchaWidgetIdInternal(id);
  };


  useEffect(() => {
    if (!appInitialized) {
      setError("Firebase core components are not yet initialized. Please wait or refresh.");
      return;
    }
    if (!authInitialized && appInitialized) { 
      setError("Firebase Authentication is initializing. Please wait. If this persists, check your Firebase setup and console for errors related to 'auth'.");
    }

    const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;

    if (authInitialized && siteKeyProvided && !appCheckInitialized && !error) {
      setError(
        "App Check Security Alert: Initialization failed even though a site key is provided. Key app functionalities (like login, signup, and AI features) will be disabled or will not work correctly. " +
        "Please check the browser console for detailed error messages (e.g., 'appCheck/recaptcha-error', 'appCheck/fetch-status-error' or debug token issues). " +
        "Verify your reCAPTCHA Enterprise setup in Google Cloud & Firebase project settings (ensure domain is authorized, API is enabled, and site key is correct)."
      );
    } else if (authInitialized && !siteKeyProvided && !appCheckInitialized && !error) { 
       console.warn(
         "AuthPage: App Check Security Notice - App Check is not configured as NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY is missing. While authentication might work, backend resources could be unprotected. It's highly recommended to set up App Check for production."
       );
    }
  }, [appInitialized, authInitialized, appCheckInitialized, error]);


   useEffect(() => {
     // Guard conditions: ensure Firebase is ready and the container element exists.
     if (!appInitialized || !authInitialized || !auth || !recaptchaContainerRef.current) {
       console.warn("AuthPage: Skipping reCAPTCHA (for MFA) setup: Firebase Auth not ready or reCAPTCHA container not found in DOM.");
       // If a verifier exists from a previous run, ensure it's cleared.
       if (recaptchaVerifier) {
         console.log("AuthPage: Cleaning up existing reCAPTCHA verifier due to dependencies/container not ready.");
         recaptchaVerifier.clear();
         setRecaptchaVerifier(null);
         setRecaptchaWidgetId(null);
         // Attempt to clear the container if it becomes available later or was briefly null
         if (recaptchaContainerRef.current) {
            recaptchaContainerRef.current.innerHTML = '';
         }
       }
       return;
     }

     // If a RecaptchaVerifier instance already exists in state, do not re-initialize.
     // The cleanup function of the effect that created it will handle its disposal.
     if (recaptchaVerifier) {
       // console.log("AuthPage: RecaptchaVerifier already exists. Skipping new initialization.");
       return;
     }
    
     // Ensure the container is clean before attempting to render a new reCAPTCHA.
     // This is crucial to prevent the "already rendered" error.
     if (recaptchaContainerRef.current) { 
        recaptchaContainerRef.current.innerHTML = ''; 
     }
     setRecaptchaWidgetId(null); // Reset internal widget ID state

      let instanceForThisEffect: RecaptchaVerifier | null = null;

      try {
        console.log("AuthPage: Initializing new RecaptchaVerifier for MFA phone auth...");
         instanceForThisEffect = new RecaptchaVerifier(auth,
           recaptchaContainerRef.current, 
           {
             size: 'invisible',
             callback: (response: any) => {
               console.log("AuthPage: reCAPTCHA (for MFA) verified automatically (invisible callback). Response:", response);
             },
             'expired-callback': () => {
               console.warn("AuthPage: reCAPTCHA (for MFA) expired, need to re-verify.");
                setError("reCAPTCHA challenge expired. Please try the action again.");
                setIsSendingMfaCode(false);
                setLoadingMessage(null);
             }
           }
         );
          setRecaptchaVerifier(instanceForThisEffect); // Store the new instance in state
          console.log("AuthPage: New RecaptchaVerifier instance (for MFA) created and set in state:", instanceForThisEffect);

         instanceForThisEffect.render().then((widgetId) => {
            if (widgetId !== undefined && widgetId !== null) { 
                 setRecaptchaWidgetId(widgetId);
                 console.log("AuthPage: reCAPTCHA (for MFA) rendered successfully with widget ID:", widgetId);
            } else {
                 console.warn("AuthPage: reCAPTCHA (for MFA) rendered but returned undefined or null widget ID.");
            }
         }).catch(renderError => {
             console.error("AuthPage: reCAPTCHA (for MFA) render error:", renderError);
            if (renderError.message && renderError.message.includes('already rendered')) {
                 console.warn("AuthPage: reCAPTCHA (for MFA) was likely already rendered in the container. This usually means the container wasn't properly cleared or multiple instances are being created.");
            } else if (renderError.message && renderError.message.toLowerCase().includes('recaptcha') || renderError.code === 'auth/network-request-failed') {
                 setError(`Failed to render reCAPTCHA for MFA (Error: ${renderError.code || 'unknown'}). This is often due to configuration issues or network problems. Please check: 1. Your domain ('${window.location.hostname}') is authorized for reCAPTCHA in Google Cloud. 2. The reCAPTCHA API is enabled. 3. Network connectivity to Google services (e.g., www.google.com/recaptcha, www.gstatic.com/recaptcha). Ensure no firewall, VPN, or ad-blocker is interfering. Detailed error: ${renderError.message}`);
            } else {
                setError("Failed to render reCAPTCHA for MFA. Phone authentication may fail. Check console for Firebase hints about 'already rendered' or other setup issues.");
            }
         });

      } catch (creationError: any) {
          console.error("AuthPage: Error creating RecaptchaVerifier instance (for MFA):", creationError.code, creationError.message, creationError);
          instanceForThisEffect = null; // Ensure it's null if creation failed
          setRecaptchaVerifier(null); // Reset state if creation failed
          if (creationError.code === 'auth/network-request-failed') {
            setError(`Failed to initialize reCAPTCHA verifier for MFA due to a network error (Code: ${creationError.code}). Ensure your internet connection is stable and that no firewall, VPN, or ad-blocker is blocking requests to Google services (e.g., www.google.com/recaptcha, www.gstatic.com/recaptcha). Also verify your Firebase project configuration and check status.firebase.google.com. Details: ${creationError.message}`);
          } else {
            setError("Failed to initialize reCAPTCHA verifier for MFA. Authentication involving phone may fail. Ensure only one reCAPTCHA container is present and it's correctly referenced.");
          }
      }

     return () => {
        console.log("AuthPage: useEffect cleanup for reCAPTCHA Verifier.");
        if (instanceForThisEffect) { 
            console.log("AuthPage: Clearing reCAPTCHA (for MFA) verifier instance created by this effect.");
            instanceForThisEffect.clear();
        }
        // Ensure the state is also nulled out if the instance being cleared was the one in state.
        // This helps prevent stale state if the component unmounts or dependencies change rapidly.
        setRecaptchaVerifier(currentVerifier => {
            if (currentVerifier === instanceForThisEffect) {
                return null;
            }
            return currentVerifier;
        });
         if (recaptchaContainerRef.current) { 
             recaptchaContainerRef.current.innerHTML = '';
         }
         setRecaptchaWidgetId(null);
     };
   }, [appInitialized, authInitialized, auth, recaptchaVerifier]); // Added recaptchaVerifier to dependency array

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    
    if (!authInitialized || !auth) {
      setError(
        'Firebase Authentication is not ready. Cannot proceed with login. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.'
      );
      return;
    }
     const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
     if (siteKeyProvided && !appCheckInitialized) { 
       console.warn("AuthPage: App Check not initialized. Authentication might fail if App Check is enforced by backend.");
       setError("App Check is not ready. Login cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).");
       return;
     }
    setLoading(true);
    setLoadingMessage('Logging in...');
    console.log("AuthPage: Attempting sign-in with email:", email);

    try {
      console.log("AuthPage: Calling signInWithEmailAndPassword...");
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("AuthPage: Sign in successful (MFA if required will be next):", userCredential.user?.uid);
      setLoadingMessage('Login successful!');
      router.push('/'); 
    } catch (err: any) {
      setLoadingMessage(null);
      if (err instanceof FirebaseError) {
          console.error("AuthPage: Login error (FirebaseError):", err.code, err.message);

          if (err.code === 'auth/multi-factor-auth-required') {
              console.log("AuthPage: MFA required error caught, proceeding to second factor.");
              setError(null);
              try {
                   const resolver = getMultiFactorResolver(auth, err);
                   console.log("AuthPage: getMultiFactorResolver result:", resolver);
                   if (resolver) {
                     console.log("AuthPage: MFA resolver obtained:", resolver);
                     setMfaResolver(resolver);
                     const phoneHints = resolver.hints.filter(
                       (hint): hint is PhoneMultiFactorInfo => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
                     );
                      console.log("AuthPage: Available MFA phone hints:", JSON.stringify(phoneHints, null, 2));
                     setMfaHints(phoneHints);
                     setIsMFAPrompt(true);
                   } else {
                      console.error("AuthPage: MFA required but getMultiFactorResolver returned null or undefined.");
                      setError("Multi-factor authentication setup seems incomplete. Please try again or contact support.");
                   }
              } catch (resolverError: any) {
                   console.error("AuthPage: Error getting MFA resolver:", resolverError.code, resolverError.message, resolverError);
                   setError("Failed to process multi-factor authentication requirement.");
              }
          } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-email') {
              console.warn("AuthPage: Login failed due to invalid credentials:", err.code);
              setError('Invalid credentials. Please check your email and password.');
          } else if (err.code === 'auth/network-request-failed') {
              console.error("AuthPage: Login failed due to a network error (auth/network-request-failed):", err.code, err.message);
              setError('Login failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com, and www.google.com/recaptcha. 5. Visit status.firebase.google.com for service outages. App Check/reCAPTCHA loading failures can also cause this.');
          } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                console.error(`AuthPage: App Check/reCAPTCHA Error during login (${err.code}):`, err.message);
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
        console.error("AuthPage: An unexpected error occurred during login:", err);
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
      setError(
        'Firebase Authentication is not ready. Cannot proceed with sign up. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.'
      );
      return;
    }
    const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
     if (siteKeyProvided && !appCheckInitialized) {
       console.warn("AuthPage: App Check not initialized. Sign-up might fail if App Check is enforced by backend.");
        setError("App Check is not ready. Sign up cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).");
        return;
     }
    setLoading(true);
    setLoadingMessage('Creating account...');
    console.log("AuthPage: Attempting sign-up with email:", email);

    try {
      console.log("AuthPage: Calling createUserWithEmailAndPassword...");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("AuthPage: Sign up successful:", userCredential.user?.uid);
      setIsSignUp(false);
      setSuccessMessage('Account created successfully! Please log in.');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setLoadingMessage(null);
        if (err instanceof FirebaseError) {
            console.error("AuthPage: Sign up error:", err.code, err.message);
            if (err.code === 'auth/email-already-in-use') {
                setError('This email address is already registered. Please log in or use a different email.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak. Please choose a stronger password (at least 6 characters).');
            } else if (err.code === 'auth/invalid-email') {
                setError('Invalid email address format.');
            } else if (err.code === 'auth/network-request-failed') {
                console.error("AuthPage: Sign up failed due to a network error (auth/network-request-failed):", err.code, err.message);
                 setError('Sign up failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com, and www.google.com/recaptcha. 5. Visit status.firebase.google.com for service outages. App Check/reCAPTCHA loading failures can also cause this.');
            } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                 console.error(`AuthPage: App Check/reCAPTCHA Error during sign up (${err.code}):`, err.message);
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
            console.error("AuthPage: An unexpected error occurred during sign up:", err);
            setError('An unexpected error occurred during sign up. Please try again.');
        }
    } finally {
      setLoading(false);
    }
  };

  const handleSendMfaCode = async () => {
      console.log("AuthPage: handleSendMfaCode triggered.");
      if (!selectedMfaHint || !mfaResolver) {
          setError("Could not initiate MFA verification. Select a phone number and try again.");
          console.error("AuthPage: Cannot send MFA code, selectedMfaHint or mfaResolver is missing.", {selectedMfaHint, mfaResolver});
          return;
      }
      if (!recaptchaVerifier) { 
           setError("reCAPTCHA verifier (for MFA) is not ready. Please wait and try again. If this persists, ensure the reCAPTCHA container is visible and there are no console errors related to its rendering (e.g., network blocks to www.google.com/recaptcha or www.gstatic.com/recaptcha). Check Firebase/GCP console for domain authorization & API settings for reCAPTCHA.");
           console.error("AuthPage: Cannot send MFA code, recaptchaVerifier (for MFA) is null or not rendered. RecaptchaVerifier:", recaptchaVerifier);
           return;
      }
       const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
       if (siteKeyProvided && !appCheckInitialized) {
         console.warn("AuthPage: App Check not initialized. Sending MFA code might fail if App Check is enforced by backend.");
         setError("App Check is not ready. MFA code sending cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error' from 'firebaseConfig.tsx'.");
         return;
       }

      setError(null);
      setIsSendingMfaCode(true);
      setLoadingMessage('Sending verification code...');
      console.log("AuthPage: Sending MFA code to selected hint:", selectedMfaHint.phoneNumber, "UID:", selectedMfaHint.uid);
      console.log("AuthPage: RecaptchaVerifier (for sending code) is:", recaptchaVerifier);


      try {
          if (!auth) throw new Error("Firebase Auth not initialized for MFA."); 
          console.log("AuthPage: Requesting MFA code for hint UID:", selectedMfaHint.uid);
          const phoneInfoOptions = {
              multiFactorHint: selectedMfaHint,
              session: mfaResolver.session
          };
          const phoneAuthProvider = new PhoneAuthProvider(auth);
          console.log("AuthPage: PhoneAuthProvider instance created:", phoneAuthProvider);

          console.log("AuthPage: Calling phoneAuthProvider.verifyPhoneNumber with reCAPTCHA verifier (for MFA)... Options:", JSON.stringify(phoneInfoOptions, null, 2));
          // Pass the state-managed recaptchaVerifier to verifyPhoneNumber
          const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
           console.log("AuthPage: Verification ID received:", verificationId);
           setMfaVerificationId(verificationId);
           setLoadingMessage('Verification code sent. Enter the code below.');

      } catch (err: any) {
          console.error("AuthPage: Error sending MFA code:", err.code, err.message, err);
          if (err instanceof FirebaseError) {
              if (err.code === 'auth/network-request-failed') {
                   console.error("AuthPage: Sending MFA code failed due to a network error (auth/network-request-failed):", err.code, err.message);
                   setError('Failed to send verification code due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com, and www.google.com/recaptcha. 5. Visit status.firebase.google.com for service outages. App Check/reCAPTCHA loading failures can also cause this.');
              } else if (err.code.includes('recaptcha') || err.code.includes('app-check') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                   console.error(`AuthPage: App Check/reCAPTCHA Error during MFA code sending (${err.code}):`, err.message);
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
              } else if (err.code === 'auth/code-expired') { 
                   setError("Verification attempt failed as the previous reCAPTCHA challenge may have expired. Please try sending the code again.");
              } else {
                   setError(`Failed to send verification code: ${err.message} (Code: ${err.code}). Please try again or contact support.`);
              }
          } else {
              setError(`Failed to send verification code: An unexpected error occurred (${err.message}). Please try again.`);
          }
          setLoadingMessage(null);
      } finally {
          setIsSendingMfaCode(false);
           // @ts-ignore
           if (typeof window !== 'undefined' && window.grecaptcha && recaptchaWidgetId !== null && typeof window.grecaptcha.reset === 'function') {
               try {
                  // @ts-ignore
                   window.grecaptcha.reset(recaptchaWidgetId);
                   console.log("AuthPage: reCAPTCHA widget (for MFA) reset after attempting to send MFA code. Widget ID:", recaptchaWidgetId);
               } catch (e) {
                   console.warn("AuthPage: Could not reset reCAPTCHA widget (for MFA) after sending MFA code:", e);
               }
           } else {
               console.log("AuthPage: No active reCAPTCHA widget (for MFA) to reset or reset function unavailable. Widget ID:", recaptchaWidgetId);
           }
      }
  };


  const handleVerifyMfaCode = async () => {
      console.log("AuthPage: handleVerifyMfaCode triggered.");
      if (!mfaVerificationCode || !mfaResolver || !mfaVerificationId) {
          setError("Missing information to verify the code. Please request a new code and try again.");
          console.error("AuthPage: Cannot verify MFA code, missing required info.", {mfaVerificationCode, mfaResolver, mfaVerificationId});
          return;
      }
      const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
      if (siteKeyProvided && !appCheckInitialized) {
        console.warn("AuthPage: App Check not initialized. Verifying MFA code might fail if App Check is enforced by backend.");
        setError("App Check is not ready. MFA code verification cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error' from 'firebaseConfig.tsx'.");
        return;
      }

      setError(null);
      setIsVerifyingMfaCode(true);
      setLoadingMessage('Verifying code...');
      console.log("AuthPage: Verifying MFA code:", mfaVerificationCode);
      console.log("AuthPage: Using mfaResolver:", mfaResolver);
      console.log("AuthPage: Using mfaVerificationId:", mfaVerificationId);


      try {
          console.log("AuthPage: Verifying MFA code...");
          const cred = PhoneMultiFactorGenerator.assertion(
              mfaVerificationId,
              mfaVerificationCode
          );
          console.log("AuthPage: MFA assertion created:", cred);
          const userCredential = await mfaResolver.resolveSignIn(cred);
          console.log("AuthPage: MFA verification successful, signed in:", userCredential.user?.uid);
          setLoadingMessage('Login successful!');
          router.push('/'); 

      } catch (err: any) {
          console.error("AuthPage: Error verifying MFA code:", err.code, err.message, err);
           if (err instanceof FirebaseError) {
                if (err.code === 'auth/invalid-verification-code') {
                   setError("Invalid verification code. Please try again.");
                } else if (err.code === 'auth/code-expired') {
                     setError("Verification code has expired. Please request a new one.");
                     setMfaVerificationId(null); 
                     setMfaVerificationCode(''); 
                     setSelectedMfaHint(null); 
                     setLoadingMessage(null);
                     // Attempt to re-trigger reCAPTCHA for a new code send attempt.
                     // This might involve resetting the reCAPTCHA widget or re-running the init effect.
                     // For now, just clearing state to allow user to retry sending.
                     if (recaptchaVerifier) {
                        console.log("AuthPage: Resetting reCAPTCHA due to expired MFA code.");
                        // @ts-ignore
                        if (typeof window !== 'undefined' && window.grecaptcha && recaptchaWidgetId !== null && typeof window.grecaptcha.reset === 'function') {
                            try { // @ts-ignore
                                window.grecaptcha.reset(recaptchaWidgetId);
                                console.log("AuthPage: reCAPTCHA widget reset successfully.");
                            } catch (e) { console.warn("AuthPage: Could not reset reCAPTCHA widget:", e); }
                        }
                        // Force re-initialization of verifier if needed, by nullifying it.
                        // This will trigger the useEffect if recaptchaVerifier is in its deps.
                        recaptchaVerifier.clear();
                        setRecaptchaVerifier(null);
                     }
                } else if (err.code === 'auth/network-request-failed') {
                     console.error("AuthPage: MFA code verification failed due to a network error (auth/network-request-failed):", err.code, err.message);
                     setError('MFA verification failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com. 5. Visit status.firebase.google.com for service outages.');
                } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                    console.error(`AuthPage: App Check/reCAPTCHA Error during MFA verification (${err.code}):`, err.message);
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
      setError(
        'Firebase Authentication is not ready. Cannot send password reset email. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.'
      );
      return;
    }
     const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
     if (siteKeyProvided && !appCheckInitialized) {
       console.warn("AuthPage: App Check not initialized. Password reset might fail if App Check is enforced by backend.");
       setError("App Check is not ready. Password reset cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).");
       return;
     }
    setLoading(true);
    setLoadingMessage('Sending password reset email...');
    console.log("AuthPage: Attempting to send password reset email to:", email);

    try {
      console.log("AuthPage: Calling sendPasswordResetEmail...");
      await sendPasswordResetEmail(auth, email);
      console.log("AuthPage: Password reset email sent successfully to:", email);
      setSuccessMessage(
        `Password reset email sent to ${email}. Please check your inbox (and spam folder).`
      );
      setIsForgotPassword(false); 
      setEmail(''); 
    } catch (err: any) {
       setLoadingMessage(null);
       if (err instanceof FirebaseError) {
           console.error("AuthPage: Password Reset Error:", err.code, err.message);
           if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
               setError(
                   'Email address not found or is invalid. Please enter a registered email address.'
               );
           } else if (err.code === 'auth/network-request-failed') {
                console.error("AuthPage: Password reset failed due to a network error (auth/network-request-failed):", err.code, err.message);
                setError('Password reset failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com. 5. Visit status.firebase.google.com for service outages.');
           } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
               console.error(`AuthPage: App Check/reCAPTCHA Error during password reset (${err.code}):`, err.message);
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
           console.error("AuthPage: An unexpected error occurred during password reset:", err);
            setError(`An unexpected error occurred during password reset (${err.message}). Please try again.`);
       }
    } finally {
      setLoading(false);
    }
  };

  const resetAuthState = () => {
    setError(null);
    setSuccessMessage(null);
    setEmail('');
    setPassword('');
    setIsMFAPrompt(false);
    setMfaResolver(null);
    setMfaHints([]);
    setSelectedMfaHint(null);
    setMfaVerificationCode('');
    setMfaVerificationId(null);
    setLoadingMessage(null); 
    console.log("AuthPage: Auth state reset.");
  };

  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp);
    setIsForgotPassword(false);
    resetAuthState();
    console.log("AuthPage: Toggled auth mode. isSignUp:", !isSignUp);
  };

  const showForgotPassword = () => {
    setIsForgotPassword(true);
    setIsSignUp(false);
    resetAuthState();
    console.log("AuthPage: Switched to Forgot Password mode.");
  };

  const showLogin = () => {
    setIsForgotPassword(false);
    setIsSignUp(false);
    resetAuthState();
     console.log("AuthPage: Switched to Login mode.");
  };
  
  const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const isAuthSystemDisabled = loading || !authInitialized || !auth || (siteKeyProvided && !appCheckInitialized);


  return (
    <div className="flex justify-center items-center min-h-screen bg-muted/40 p-4"> 
      <div className="bg-card text-card-foreground p-6 sm:p-8 rounded-lg shadow-lg w-full max-w-md border"> 

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
            <AlertTitle>{isSignUp ? 'Sign Up Error' : isForgotPassword ? 'Reset Password Error' : isMFAPrompt ? 'MFA Error' : error.toLowerCase().includes("app check") || error.toLowerCase().includes("security alert") ? 'Security/Initialization Error' : 'Login Error'}</AlertTitle>
            <AlertDescription suppressHydrationWarning={true}>{error}</AlertDescription>
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
                <label className="block text-sm font-medium mb-2" htmlFor="email-login">Email</label>
                <Input
                  className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                  id="email-login" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required disabled={isAuthSystemDisabled} suppressHydrationWarning={true}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" htmlFor="password-login">Password</label>
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
                  <label className="block text-sm font-medium mb-2" htmlFor="email-signup">Email</label>
                  <Input
                    className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                    id="email-signup" type="email" placeholder="you@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required disabled={isAuthSystemDisabled} suppressHydrationWarning={true}
                  />
              </div>
              <div className="mb-6">
                  <label className="block text-sm font-medium mb-2" htmlFor="password-signup">Password</label>
                  <Input
                    className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                    id="password-signup" type="password" placeholder="Choose a strong password" value={password}
                    onChange={(e) => setPassword(e.target.value)} required disabled={isAuthSystemDisabled} suppressHydrationWarning={true}
                  />
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
                <label className="block text-sm font-medium mb-2" htmlFor="email-forgot">Email</label>
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

        {isMFAPrompt && (
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
                        console.log("AuthPage: MFA hint selected:", hint);
                        setSelectedMfaHint(hint);
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
                           <label className="block text-sm font-medium mb-2" htmlFor="mfa-code">Verification Code</label>
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
                                    console.log("AuthPage: User requested a new MFA code.");
                                    setMfaVerificationId(null); 
                                    setSelectedMfaHint(null); 
                                    setMfaVerificationCode('');
                                    setError(null);
                                    setLoadingMessage(null);
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
                    console.log("AuthPage: User cancelled MFA / went back to login.");
                    showLogin();
                }} className="text-sm" disabled={isAuthSystemDisabled && !isMFAPrompt} suppressHydrationWarning={true}>
                  Cancel MFA / Back to Login
                </Button>
            </div>
          </>
        )}

         
         <div ref={recaptchaContainerRef} id="recaptcha-container-mfa" className="my-4" suppressHydrationWarning={true}></div>

      </div>
    </div>
  );
};

export default AuthPage;