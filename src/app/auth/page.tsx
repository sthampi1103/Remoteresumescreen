
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
  const [recaptchaWidgetId, setRecaptchaWidgetIdInternal] = useState<number | null>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);

  const router = useRouter();
  const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const isAuthSystemDisabled = loading || !authInitialized || !auth || (siteKeyProvided && !appCheckInitialized);

  const setRecaptchaWidgetId = (id: number | null) => {
    console.log("AuthPage: Setting reCAPTCHA widget ID (for MFA):", id);
    setRecaptchaWidgetIdInternal(id);
  };


  useEffect(() => {
    console.log(
        "AuthPage: Error display useEffect triggered. appInitialized:", appInitialized,
        "authInitialized:", authInitialized, "appCheckInitialized:", appCheckInitialized,
        "siteKeyProvided:", siteKeyProvided, "current error:", error
    );
    if (!appInitialized) {
      const msg = "Firebase core components are not yet initialized. Please wait or refresh. Inputs may be disabled.";
      console.error("AuthPage: Condition for error met - !appInitialized. Setting error:", msg);
      setError(msg);
      return;
    }
    if (!authInitialized && appInitialized) {
      const msg = "Firebase Authentication is initializing. Please wait. If this persists, check your Firebase setup and console for errors related to 'auth'. Inputs may be disabled.";
      console.error("AuthPage: Condition for error met - !authInitialized && appInitialized. Setting error:", msg);
      setError(msg);
    }

    // This condition should now be more prominent if App Check fails with a site key.
    if (authInitialized && siteKeyProvided && !appCheckInitialized) {
      const msg = "App Check Security Alert: Initialization failed even though a site key is provided. Key app functionalities (like login, signup, and AI features) will be disabled or will not work correctly. Inputs are disabled. " +
        "Please check the browser console for detailed error messages (e.g., 'appCheck/recaptcha-error', 'appCheck/fetch-status-error' or debug token issues). " +
        "Verify your reCAPTCHA Enterprise setup in Google Cloud & Firebase project settings (ensure domain is authorized, API is enabled, and site key is correct).";
        console.error("AuthPage: Condition for error met - authInitialized && siteKeyProvided && !appCheckInitialized. Setting error:", msg);
      setError(msg);
    } else if (authInitialized && !siteKeyProvided && !appCheckInitialized && !error) { // Added !error to prevent overwriting existing critical errors
       console.warn("AuthPage: App Check Security Notice - App Check is not configured as NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY is missing. While authentication might work, backend resources could be unprotected. It's highly recommended to set up App Check for production.");
    } else if (error) {
        console.log("AuthPage: An error is already set, not overwriting with App Check notice:", error);
    } else {
        console.log("AuthPage: All initial checks passed or no new critical error to display.");
    }
  }, [appInitialized, authInitialized, appCheckInitialized, error, siteKeyProvided]); // Added siteKeyProvided to dependency array


   useEffect(() => {
    console.log("AuthPage: Recaptcha Verifier useEffect for MFA. NODE_ENV:", process.env.NODE_ENV);
    if (process.env.NODE_ENV !== 'production') {
      console.warn("AuthPage: In non-production environment. Clearing any existing reCAPTCHA verifier for MFA.");
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        setRecaptchaVerifier(null);
        if (recaptchaContainerRef.current) {
          recaptchaContainerRef.current.innerHTML = '';
        }
        setRecaptchaWidgetId(null);
      }
      return;
    }

     console.log("AuthPage: Production environment. Checking conditions for reCAPTCHA verifier (MFA). appInitialized:", appInitialized, "authInitialized:", authInitialized, "auth instance:", !!auth, "recaptchaContainerRef.current:", !!recaptchaContainerRef.current);
     if (!appInitialized || !authInitialized || !auth || !recaptchaContainerRef.current) {
       console.warn("AuthPage: Skipping reCAPTCHA setup for MFA: Firebase Auth not ready or container not found.");
       if (recaptchaVerifier) {
         console.log("AuthPage: Clearing existing reCAPTCHA verifier (MFA) as conditions not met.");
         recaptchaVerifier.clear();
         setRecaptchaVerifier(null);
         setRecaptchaWidgetId(null);
         if (recaptchaContainerRef.current) { // Double check current ref
            recaptchaContainerRef.current.innerHTML = '';
         }
       }
       return;
     }

     if (recaptchaVerifier) {
       console.log("AuthPage: reCAPTCHA verifier (MFA) already exists. Skipping re-initialization.");
       return;
     }
    
     if (recaptchaContainerRef.current) { 
        console.log("AuthPage: Clearing recaptchaContainerRef.current.innerHTML before new verifier.");
        recaptchaContainerRef.current.innerHTML = ''; 
     }
     setRecaptchaWidgetId(null); // Reset widget ID

      console.log("AuthPage: Initializing new RecaptchaVerifier for MFA phone auth...");
      let instanceForThisEffect: RecaptchaVerifier | null = null;

      try {
         instanceForThisEffect = new RecaptchaVerifier(auth,
           recaptchaContainerRef.current, 
           {
             size: 'invisible',
             callback: (response: any) => {
                console.log("AuthPage: reCAPTCHA (for MFA) successful callback. Response:", response);
             },
             'expired-callback': () => {
                console.warn("AuthPage: reCAPTCHA (for MFA) challenge expired.");
                setError("reCAPTCHA challenge expired. Please try the action again.");
                setIsSendingMfaCode(false);
                setLoadingMessage(null);
             }
           }
         );
         console.log("AuthPage: New RecaptchaVerifier instance (for MFA) created:", instanceForThisEffect);
          setRecaptchaVerifier(instanceForThisEffect); 

         console.log("AuthPage: Attempting to render reCAPTCHA (for MFA)...");
         instanceForThisEffect.render().then((widgetId) => {
            console.log("AuthPage: reCAPTCHA (for MFA) rendered. Widget ID:", widgetId);
            if (widgetId !== undefined && widgetId !== null) { 
                 setRecaptchaWidgetId(widgetId);
            }
         }).catch(renderError => {
            console.error("AuthPage: reCAPTCHA (for MFA) render error:", renderError);
            if (renderError.message && renderError.message.includes('already rendered')) {
                console.warn("AuthPage: reCAPTCHA (for MFA) reported as 'already rendered'. This might be a quick re-render or a sign of conflict. Current widgetId:", recaptchaWidgetId);
            } else if (renderError.message && renderError.message.toLowerCase().includes('recaptcha') || renderError.code === 'auth/network-request-failed') {
                 setError(`Failed to render reCAPTCHA for MFA (Error: ${renderError.code || 'unknown'}). This is often due to configuration issues or network problems. Please check: 1. Your domain ('${typeof window !== 'undefined' ? window.location.hostname : ''}') is authorized for reCAPTCHA in Google Cloud. 2. The reCAPTCHA API is enabled. 3. Network connectivity to Google services (e.g., www.google.com/recaptcha, www.gstatic.com/recaptcha). Ensure no firewall, VPN, or ad-blocker is interfering. Detailed error: ${renderError.message}`);
            } else {
                setError("Failed to render reCAPTCHA for MFA. Phone authentication may fail. Check console for Firebase hints about 'already rendered' or other setup issues.");
            }
         });

      } catch (creationError: any) {
          console.error("AuthPage: Failed to create RecaptchaVerifier instance (for MFA):", creationError);
          instanceForThisEffect = null; 
          setRecaptchaVerifier(null); 
          if (creationError.code === 'auth/network-request-failed') {
            setError(`Failed to initialize reCAPTCHA verifier for MFA due to a network error (Code: ${creationError.code}). Ensure your internet connection is stable and that no firewall, VPN, or ad-blocker is blocking requests to Google services (e.g., www.google.com/recaptcha, www.gstatic.com/recaptcha). Also verify your Firebase project configuration and check status.firebase.google.com. Details: ${creationError.message}`);
          } else {
            setError("Failed to initialize reCAPTCHA verifier for MFA. Authentication involving phone may fail. Ensure only one reCAPTCHA container is present and it's correctly referenced.");
          }
      }

     return () => {
        console.log("AuthPage: Cleanup for reCAPTCHA verifier (MFA) useEffect. Instance to clear:", instanceForThisEffect);
        if (instanceForThisEffect) { 
            instanceForThisEffect.clear();
        }
        setRecaptchaVerifier(currentVerifier => {
            if (currentVerifier === instanceForThisEffect) {
                console.log("AuthPage: Clearing the specific reCAPTCHA verifier instance (MFA) from state.");
                return null;
            }
            console.log("AuthPage: Not clearing reCAPTCHA verifier (MFA) from state as it's not the one from this effect instance.");
            return currentVerifier;
        });
         if (recaptchaContainerRef.current) { 
             console.log("AuthPage: Clearing recaptchaContainerRef.current.innerHTML in cleanup.");
             recaptchaContainerRef.current.innerHTML = '';
         }
         setRecaptchaWidgetId(null); // Reset widget ID in cleanup
     };
   }, [appInitialized, authInitialized, auth, recaptchaVerifier]); // Removed recaptchaWidgetId as it's managed internally

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    console.log("AuthPage: Login submit. Email:", email, "Password:", "*".repeat(password.length));
    
    if (!authInitialized || !auth) {
      const msg = 'Firebase Authentication is not ready. Cannot proceed with login. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.';
      console.error("AuthPage: Login aborted - " + msg);
      setError(msg);
      return;
    }
     
     if (siteKeyProvided && !appCheckInitialized) { 
       const msg = "App Check is not ready. Login cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).";
       console.error("AuthPage: Login aborted - " + msg);
       setError(msg);
       return;
     }
    setLoading(true);
    setLoadingMessage('Logging in...');

    try {
      console.log("AuthPage: Calling signInWithEmailAndPassword...");
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("AuthPage: signInWithEmailAndPassword successful. UserCredential:", userCredential);
      setLoadingMessage('Login successful!');
      router.push('/'); 
    } catch (err: any) {
      console.error("AuthPage: signInWithEmailAndPassword error:", err.code, err.message, err);
      setLoadingMessage(null);
      if (err instanceof FirebaseError) {

          if (err.code === 'auth/multi-factor-auth-required') {
              console.warn("AuthPage: MFA is required by Firebase for this account.");
              if (process.env.NODE_ENV !== 'production') {
                  console.warn("AuthPage: In non-production environment. MFA prompt is skipped. User is NOT fully logged in.");
                  setError("MFA is required for this account. The MFA prompt is skipped in this non-production environment, and you will not be fully logged in. Configure your Firebase project or user settings if MFA is not desired for development/testing.");
              } else {
                  console.log("AuthPage: Production environment. Processing MFA requirement.");
                  setError(null);
                  try {
                       console.log("AuthPage: Calling getMultiFactorResolver...");
                       const resolver = getMultiFactorResolver(auth, err);
                       console.log("AuthPage: getMultiFactorResolver result:", resolver);
                       if (resolver) {
                         setMfaResolver(resolver);
                         const phoneHints = resolver.hints.filter(
                           (hint): hint is PhoneMultiFactorInfo => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
                         );
                         console.log("AuthPage: Available MFA phone hints:", phoneHints);
                         setMfaHints(phoneHints);
                         setIsMFAPrompt(true);
                       } else {
                          console.error("AuthPage: MFA resolver is null!");
                          setError("Multi-factor authentication setup seems incomplete. Please try again or contact support.");
                       }
                  } catch (resolverError: any) {
                       console.error("AuthPage: Error calling getMultiFactorResolver:", resolverError);
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
      console.log("AuthPage: Login submit finished.");
    }
  };

  const handleSignUpSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    console.log("AuthPage: Sign up submit. Email:", email, "Password:", "*".repeat(password.length), "Tenant ID:", tenantId);
    
    if (!authInitialized || !auth) {
      const msg = 'Firebase Authentication is not ready. Cannot proceed with sign up. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.';
      console.error("AuthPage: Sign up aborted - " + msg);
      setError(msg);
      return;
    }
    
     if (siteKeyProvided && !appCheckInitialized) {
        const msg = "App Check is not ready. Sign up cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).";
        console.error("AuthPage: Sign up aborted - " + msg);
        setError(msg);
        return;
     }
    setLoading(true);
    setLoadingMessage('Creating account...');

    try {
      console.log("AuthPage: Calling createUserWithEmailAndPassword...");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("AuthPage: createUserWithEmailAndPassword successful. UserCredential:", userCredential);
      
      // Placeholder for custom claims logic. In a real app, this would be a call to a backend function.
      if (tenantId.trim() !== '') {
        console.log("AuthPage: Tenant ID provided:", tenantId, ". In a real app, custom claims would be set here via a backend function.");
      }

      setIsSignUp(false);
      setSuccessMessage('Account created successfully! Please log in.');
      setEmail('');
      setPassword('');
      setTenantId('');
    } catch (err: any) {
      console.error("AuthPage: createUserWithEmailAndPassword error:", err.code, err.message, err);
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
      console.log("AuthPage: Sign up submit finished.");
    }
  };

  const handleSendMfaCode = async () => {
      console.log("AuthPage: Attempting to send MFA code. NODE_ENV:", process.env.NODE_ENV);
      if (process.env.NODE_ENV !== 'production') {
          setError("MFA code sending is disabled in non-production environments.");
          console.warn("AuthPage: Attempted to send MFA code in non-production environment. Aborting.");
          return;
      }

      if (!selectedMfaHint || !mfaResolver) {
          const msg = "Could not initiate MFA verification. Select a phone number and try again. Selected hint or MFA resolver is missing.";
          console.error("AuthPage: Send MFA code aborted - " + msg, "Selected Hint:", selectedMfaHint, "MFA Resolver:", mfaResolver);
          setError(msg);
          return;
      }
      if (!recaptchaVerifier) { 
           const msg = "reCAPTCHA verifier (for MFA) is not ready. Please wait and try again. If this persists, ensure the reCAPTCHA container is visible and there are no console errors related to its rendering (e.g., network blocks to www.google.com/recaptcha or www.gstatic.com/recaptcha). Check Firebase/GCP console for domain authorization & API settings for reCAPTCHA.";
           console.error("AuthPage: Send MFA code aborted - " + msg);
           setError(msg);
           return;
      }
       
       if (siteKeyProvided && !appCheckInitialized) {
         const msg = "App Check is not ready. MFA code sending cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error' from 'firebaseConfig.tsx'.";
         console.error("AuthPage: Send MFA code aborted - " + msg);
         setError(msg);
         return;
       }

      setError(null);
      setIsSendingMfaCode(true);
      setLoadingMessage('Sending verification code...');
      console.log("AuthPage: Sending MFA code to:", selectedMfaHint.phoneNumber, "using session:", mfaResolver.session);

      try {
          if (!auth) throw new Error("Firebase Auth not initialized for MFA."); 
          const phoneInfoOptions = {
              multiFactorHint: selectedMfaHint,
              session: mfaResolver.session
          };
          const phoneAuthProvider = new PhoneAuthProvider(auth);
          console.log("AuthPage: Calling phoneAuthProvider.verifyPhoneNumber with options:", phoneInfoOptions, "and verifier:", recaptchaVerifier);

          const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
           console.log("AuthPage: phoneAuthProvider.verifyPhoneNumber successful. Verification ID:", verificationId);
           setMfaVerificationId(verificationId);
           setLoadingMessage('Verification code sent. Enter the code below.');

      } catch (err: any) {
          console.error("AuthPage: phoneAuthProvider.verifyPhoneNumber error:", err.code, err.message, err);
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
                       console.log("AuthPage: Clearing reCAPTCHA verifier (MFA) due to code-expired or similar error.");
                       recaptchaVerifier.clear();
                       setRecaptchaVerifier(null); 
                       if (recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
                       setRecaptchaWidgetId(null);
                   }
                   setSelectedMfaHint(null); 
                   setMfaVerificationId(null); 
              } else {
                   setError(`Failed to send verification code: ${err.message} (Code: ${err.code}). Please try again or contact support.`);
              }
          } else {
              setError(`Failed to send verification code: An unexpected error occurred (${err.message}). Please try again.`);
          }
          setLoadingMessage(null);
      } finally {
          setIsSendingMfaCode(false);
          console.log("AuthPage: Send MFA code finished.");
           // @ts-ignore
           if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined' && window.grecaptcha && recaptchaWidgetId !== null && typeof window.grecaptcha.reset === 'function') {
               try { 
                   console.log("AuthPage: Attempting to reset reCAPTCHA widget (MFA) with ID:", recaptchaWidgetId);
                   // @ts-ignore
                   window.grecaptcha.reset(recaptchaWidgetId);
               } catch (e) {
                   console.warn("AuthPage: Error resetting reCAPTCHA widget (MFA):", e);
               }
           }
      }
  };


  const handleVerifyMfaCode = async () => {
      console.log("AuthPage: Attempting to verify MFA code. NODE_ENV:", process.env.NODE_ENV);
      if (process.env.NODE_ENV !== 'production') {
        setError("MFA code verification is disabled in non-production environments.");
        console.warn("AuthPage: Attempted to verify MFA code in non-production environment. Aborting.");
        return;
      }

      if (!mfaVerificationCode || !mfaResolver || !mfaVerificationId) {
          const msg = "Missing information to verify the code. Please request a new code and try again. Verification code, resolver, or verification ID is missing.";
          console.error("AuthPage: Verify MFA code aborted - " + msg, "Code:", mfaVerificationCode, "Resolver:", mfaResolver, "Verification ID:", mfaVerificationId);
          setError(msg);
          return;
      }
      
      if (siteKeyProvided && !appCheckInitialized) {
        const msg = "App Check is not ready. MFA code verification cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error' from 'firebaseConfig.tsx'.";
        console.error("AuthPage: Verify MFA code aborted - " + msg);
        setError(msg);
        return;
      }

      setError(null);
      setIsVerifyingMfaCode(true);
      setLoadingMessage('Verifying code...');
      console.log("AuthPage: Verifying MFA code:", mfaVerificationCode, "with Verification ID:", mfaVerificationId);

      try {
          const cred = PhoneMultiFactorGenerator.assertion(
              mfaVerificationId,
              mfaVerificationCode
          );
          console.log("AuthPage: MFA assertion created:", cred);
          console.log("AuthPage: Calling mfaResolver.resolveSignIn with assertion...");
          const userCredential = await mfaResolver.resolveSignIn(cred);
          console.log("AuthPage: mfaResolver.resolveSignIn successful. UserCredential:", userCredential);
          setLoadingMessage('Login successful!');
          router.push('/'); 

      } catch (err: any) {
           console.error("AuthPage: mfaResolver.resolveSignIn error:", err.code, err.message, err);
           if (err instanceof FirebaseError) {
                if (err.code === 'auth/invalid-verification-code') {
                   setError("Invalid verification code. Please try again.");
                } else if (err.code === 'auth/code-expired') {
                     setError("Verification code has expired. Please request a new one.");
                     setMfaVerificationId(null); 
                     setMfaVerificationCode(''); 
                     setSelectedMfaHint(null); 
                     setLoadingMessage(null);
                     if (recaptchaVerifier && process.env.NODE_ENV === 'production') { 
                        console.log("AuthPage: Clearing reCAPTCHA verifier (MFA) due to code-expired error during verification.");
                        // @ts-ignore
                        if (typeof window !== 'undefined' && window.grecaptcha && recaptchaWidgetId !== null && typeof window.grecaptcha.reset === 'function') {
                            try { 
                                console.log("AuthPage: Attempting to reset reCAPTCHA widget (MFA) with ID:", recaptchaWidgetId, "due to expired code.");
                                // @ts-ignore
                                window.grecaptcha.reset(recaptchaWidgetId);
                            } catch (e) { 
                                console.warn("AuthPage: Error resetting reCAPTCHA widget (MFA) after expired code:", e);
                            }
                        }
                        recaptchaVerifier.clear();
                        setRecaptchaVerifier(null); 
                        if (recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
                        setRecaptchaWidgetId(null);
                     }
                } else if (err.code === 'auth/network-request-failed') {
                     setError('MFA verification failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com. 5. Visit status.firebase.google.com.');
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
          console.log("AuthPage: Verify MFA code finished.");
      }
  };

  const handleForgotPasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    console.log("AuthPage: Forgot password submit. Email:", email);
    
    if (!authInitialized || !auth) {
      const msg = 'Firebase Authentication is not ready. Cannot send password reset email. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.';
      console.error("AuthPage: Forgot password aborted - " + msg);
      setError(msg);
      return;
    }
     
     if (siteKeyProvided && !appCheckInitialized) {
       const msg = "App Check is not ready. Password reset cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).";
       console.error("AuthPage: Forgot password aborted - " + msg);
       setError(msg);
       return;
     }
    setLoading(true);
    setLoadingMessage('Sending password reset email...');

    try {
      console.log("AuthPage: Calling sendPasswordResetEmail...");
      await sendPasswordResetEmail(auth, email);
      console.log("AuthPage: sendPasswordResetEmail successful.");
      setSuccessMessage(
        `Password reset email sent to ${email}. Please check your inbox (and spam folder).`
      );
      setIsForgotPassword(false); 
      setEmail(''); 
    } catch (err: any) {
       console.error("AuthPage: sendPasswordResetEmail error:", err.code, err.message, err);
       setLoadingMessage(null);
       if (err instanceof FirebaseError) {
           if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
               setError(
                   'Email address not found or is invalid. Please enter a registered email address.'
               );
           } else if (err.code === 'auth/network-request-failed') {
                setError('Password reset failed due to a network issue. Please check: 1. Your internet connection. 2. Any firewall, VPN, or proxy settings that might be blocking Google/Firebase services. 3. Browser extensions (like ad-blockers) that could interfere. 4. If you can access google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com. 5. Visit status.firebase.google.com for service outages.');
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
      console.log("AuthPage: Forgot password submit finished.");
    }
  };

  const resetAuthState = () => {
    console.log("AuthPage: Resetting auth state.");
    setError(null);
    setSuccessMessage(null);
    setEmail('');
    setPassword('');
    setTenantId('');
    setIsMFAPrompt(false);
    setMfaResolver(null);
    setMfaHints([]);
    setSelectedMfaHint(null);
    setMfaVerificationCode('');
    setMfaVerificationId(null);
    setLoadingMessage(null); 
  };

  const toggleAuthMode = () => {
    console.log("AuthPage: Toggling auth mode. Current isSignUp:", isSignUp);
    setIsSignUp(!isSignUp);
    setIsForgotPassword(false);
    resetAuthState();
  };

  const showForgotPassword = () => {
    console.log("AuthPage: Showing forgot password screen.");
    setIsForgotPassword(true);
    setIsSignUp(false);
    resetAuthState();
  };

  const showLogin = () => {
    console.log("AuthPage: Showing login screen.");
    setIsForgotPassword(false);
    setIsSignUp(false);
    resetAuthState();
  };
  
  // Log current disabled state
  if (typeof window !== 'undefined') { // Prevent SSR logging for this one
      console.log("AuthPage: UI Disabled State Check - loading:", loading, "authInitialized:", authInitialized, "auth:", !!auth, "siteKeyProvided:", siteKeyProvided, "appCheckInitialized:", appCheckInitialized, "isAuthSystemDisabled RESULT:", isAuthSystemDisabled);
  }


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
            <AlertTitle>{isSignUp ? 'Sign Up Error' : isForgotPassword ? 'Reset Password Error' : isMFAPrompt ? 'MFA Error' : error.toLowerCase().includes("app check") || error.toLowerCase().includes("security alert") || error.toLowerCase().includes("core components") || error.toLowerCase().includes("authentication is initializing") ? 'Security/Initialization Error' : 'Login Error'}</AlertTitle>
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
                                    console.log("AuthPage: User requested new MFA code. Resetting MFA state.");
                                    setMfaVerificationId(null); 
                                    setSelectedMfaHint(null); 
                                    setMfaVerificationCode('');
                                    setError(null);
                                    setLoadingMessage(null);
                                    if (recaptchaVerifier && process.env.NODE_ENV === 'production') {
                                      console.log("AuthPage: Clearing reCAPTCHA verifier (MFA) for new code request.");
                                      recaptchaVerifier.clear();
                                      setRecaptchaVerifier(null); 
                                      if (recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
                                      setRecaptchaWidgetId(null);
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
                    console.log("AuthPage: User cancelled MFA / Back to Login.");
                    showLogin();
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
