'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  RecaptchaVerifier,
  // getAuth, // No longer getAuth here, use from firebaseConfig
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  PhoneAuthProvider,
  getMultiFactorResolver,
  PhoneMultiFactorGenerator,
  PhoneMultiFactorInfo,
  ConfirmationResult,
  UserCredential,
  createUserWithEmailAndPassword,
  MultiFactorResolver, // Explicitly type mfaResolver
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { appInitialized, auth, authInitialized, appCheckInitialized } from '../firebaseConfig'; // Import auth and authInitialized
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


  // MFA states
  const [isMFAPrompt, setIsMFAPrompt] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null); // Typed resolver
  const [mfaHints, setMfaHints] = useState<PhoneMultiFactorInfo[]>([]);
  const [selectedMfaHint, setSelectedMfaHint] =
    useState<PhoneMultiFactorInfo | null>(null);
  const [mfaVerificationCode, setMfaVerificationCode] = useState('');
  // const [mfaConfirmationResult, setMfaConfirmationResult] = useState<ConfirmationResult | null>(null); // Not directly used, verificationId is used
   const [isSendingMfaCode, setIsSendingMfaCode] = useState(false);
   const [isVerifyingMfaCode, setIsVerifyingMfaCode] = useState(false);
   const recaptchaContainerRef = useRef<HTMLDivElement>(null);
   // Use state for recaptchaVerifier and widgetId to manage their lifecycle
   const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);
   const [recaptchaWidgetId, setRecaptchaWidgetId] = useState<number | null>(null);


  const router = useRouter();

  useEffect(() => {
    if (appInitialized && authInitialized && !appCheckInitialized && !error && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
      setError(
        "App Check Security Alert: Initialization failed even though a site key is provided. Key app functionalities (like login, signup, and AI features) will be disabled or will not work correctly. " +
        "Please check the browser console for detailed error messages (e.g., 'appCheck/recaptcha-error', 'appCheck/fetch-status-error' or debug token issues). " +
        "Verify your reCAPTCHA Enterprise setup in Google Cloud & Firebase project settings (ensure domain is authorized, API is enabled, and site key is correct)."
      );
    } else if (appInitialized && authInitialized && !appCheckInitialized && !error && !process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
       setError(
         "App Check Security Notice: App Check is not configured as NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY is missing. While authentication might work, backend resources could be unprotected. It's highly recommended to set up App Check for production."
       );
    }
  }, [appInitialized, authInitialized, appCheckInitialized, error]);


   useEffect(() => {
     if (!appInitialized || !authInitialized || !auth || !recaptchaContainerRef.current) {
       console.warn("Skipping reCAPTCHA setup: Firebase Auth not ready or container not found.");
       return;
      }
      
      // Clear previous instance before rendering a new one
     if (recaptchaVerifier) {
         console.log("Clearing existing reCAPTCHA verifier instance.");
         recaptchaVerifier.clear();
         setRecaptchaVerifier(null); // Clear the state
     }
      // @ts-ignore
     recaptchaWidgetId = null;

      try {
        console.log("Initializing new RecaptchaVerifier...");
         recaptchaVerifier = new RecaptchaVerifier(auth, // Use auth from firebaseConfig
           recaptchaContainerRef.current,
           {
             size: 'invisible',
             callback: (response: any) => {
               console.log("reCAPTCHA verified automatically (invisible callback).");
             },
             'expired-callback': () => {
               console.warn("reCAPTCHA expired, need to re-verify.");
                setError("reCAPTCHA challenge expired. Please try the action again.");
                setIsSendingMfaCode(false);
                setLoadingMessage(null);
             }
           }
         );

         recaptchaVerifier.render().then((widgetId) => {
            if (widgetId !== undefined) {
                 setRecaptchaWidgetId(widgetId);
                recaptchaWidgetId = widgetId;
                console.log("reCAPTCHA rendered successfully, widget ID:", widgetId);
            } else {
                 console.warn("reCAPTCHA rendered but returned undefined widget ID.");
            }
         }).catch(err => {
             console.error("reCAPTCHA render error:", err);
            if (err.message && err.message.includes('already rendered')) {
                 console.warn("reCAPTCHA was likely already rendered in the container.");
            } else {
                setError("Failed to render reCAPTCHA. Phone authentication may fail. Check console for Firebase hints about 'already rendered' or other setup issues.");
            }
         });

      } catch (err) {
          console.error("Error creating RecaptchaVerifier:", err);
          setError("Failed to initialize reCAPTCHA verifier. Authentication involving phone may fail. Ensure only one reCAPTCHA container is present and it's correctly referenced.");
      }

     return () => {
        if (recaptchaVerifier) { // Check if verifier exists in state
            console.log("Clearing reCAPTCHA verifier on component unmount.");
            recaptchaVerifier.clear();
            setRecaptchaVerifier(null); // Clear state
            setRecaptchaWidgetId(null); // Clear state
        }
         if (recaptchaContainerRef.current) {
             recaptchaContainerRef.current.innerHTML = '';
         }
     };
   }, [appInitialized, authInitialized, auth]); // Depend on these values to trigger setup

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    setLoadingMessage('Logging in...');

    if (!appInitialized || !authInitialized || !auth) {
      setError(
        'Firebase is not properly initialized. Cannot proceed with login. Check your Firebase setup and environment variables.'
      );
      setLoading(false);
      setLoadingMessage(null);
      return;
    }
     if (!appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) { // Only warn if site key is present but App Check failed
       console.warn("App Check not initialized. Authentication might fail if App Check is enforced.");
       setError("App Check is not ready. Login cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).");
       setLoading(false);
       setLoadingMessage(null);
       return;
     }

    try {
      console.log("Calling signInWithEmailAndPassword...");
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("Sign in successful (no MFA required or handled):", userCredential.user?.uid);
      setLoadingMessage('Login successful!');
      router.push('/');
    } catch (err: any) {
      setLoadingMessage(null);
      if (err instanceof FirebaseError) {
          console.error("Login error (FirebaseError):", err.code, err.message);

          if (err.code === 'auth/multi-factor-auth-required') {
              console.log("MFA required, proceeding to second factor.");
              setError(null);
              try {
                   const resolver = getMultiFactorResolver(auth, err);
                   if (resolver) {
                     console.log("MFA resolver obtained:", resolver);
                     setMfaResolver(resolver);
                     const phoneHints = resolver.hints.filter(
                       (hint): hint is PhoneMultiFactorInfo => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
                     );
                      console.log("Available MFA phone hints:", phoneHints);
                     setMfaHints(phoneHints);
                     setIsMFAPrompt(true);
                   } else {
                      console.error("MFA required but getMultiFactorResolver returned null or undefined.");
                      setError("Multi-factor authentication setup seems incomplete. Please try again or contact support.");
                   }
              } catch (resolverError) {
                   console.error("Error getting MFA resolver:", resolverError);
                   setError("Failed to process multi-factor authentication requirement.");
              }
          } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-email') {
              console.warn("Login failed due to invalid credentials:", err.code);
              setError('Invalid credentials. Please check your email and password.');
          } else if (err.code === 'auth/network-request-failed') {
              console.error("Login failed due to a network error:", err.code, err.message);
              setError('Login failed: A network error occurred. Please check your internet connection, firewall, or proxy settings. Also, verify that Firebase services are operational at status.firebase.google.com.');
          } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                console.error(`App Check/reCAPTCHA Error during login (${err.code}):`, err.message);
                let userFriendlyMessage = `Authentication failed due to a security check (${err.code}). `;
                if (err.code.includes('recaptcha-error')) {
                    userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized in Google Cloud, reCAPTCHA Enterprise API not enabled) or your network connection. Please try again or contact support. Check the browser console for more Firebase hints.";
                } else if (err.code.includes('fetch-status-error')) { // Specific for 403 from App Check server
                     userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization in Google Cloud for your reCAPTCHA key, ensure the correct site key is used in Firebase, and check API enablement. See console for detailed logs from firebaseConfig.tsx.";
                }
                else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                    userFriendlyMessage += "Ensure App Check is configured correctly in Firebase Console (e.g., site key, debug token if local) and your environment is supported. Refreshing the page might help. Contact support if the issue persists. Check the browser console for Firebase hints.";
                } else if (err.code.includes('app-not-authorized')) {
                    userFriendlyMessage += "This app is not authorized to use Firebase Authentication. Check your Firebase project setup, including authorized domains.";
                } else {
                     userFriendlyMessage += "Please try again. Check the browser console for more details.";
                 }
                setError(userFriendlyMessage);
           } else {
              setError(`Login failed: ${err.message} (Code: ${err.code}). Please try again or contact support if the issue persists.`);
          }
      } else {
        console.error("An unexpected error occurred during login:", err);
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
    setLoading(true);
    setLoadingMessage('Creating account...');

    if (!appInitialized || !authInitialized || !auth) {
      setError(
        'Firebase is not properly initialized. Cannot proceed with sign up. Check your Firebase setup and environment variables.'
      );
      setLoading(false);
      setLoadingMessage(null);
      return;
    }
     if (!appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
       console.warn("App Check not initialized. Sign-up might fail if App Check is enforced.");
        setError("App Check is not ready. Sign up cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).");
        setLoading(false);
        setLoadingMessage(null);
        return;
     }

    try {
      console.log("Calling createUserWithEmailAndPassword...");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("Sign up successful:", userCredential.user?.uid);
      setIsSignUp(false);
      setSuccessMessage('Account created successfully! Please log in.');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      setLoadingMessage(null);
        if (err instanceof FirebaseError) {
            console.error("Sign up error:", err.code, err.message);
            if (err.code === 'auth/email-already-in-use') {
                setError('This email address is already registered. Please log in or use a different email.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak. Please choose a stronger password (at least 6 characters).');
            } else if (err.code === 'auth/invalid-email') {
                setError('Invalid email address format.');
            } else if (err.code === 'auth/network-request-failed') {
                console.error("Sign up failed due to a network error:", err.code, err.message);
                setError('Sign up failed: A network error occurred. Please check your internet connection, firewall, or proxy settings. Also, verify that Firebase services are operational at status.firebase.google.com.');
            } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                 console.error(`App Check/reCAPTCHA Error during sign up (${err.code}):`, err.message);
                 let userFriendlyMessage = `Sign up failed due to a security check (${err.code}). `;
                 if (err.code.includes('recaptcha-error')) {
                    userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized in Google Cloud, reCAPTCHA Enterprise API not enabled) or your network connection. Please try again or contact support. Check the browser console for more Firebase hints.";
                 } else if (err.code.includes('fetch-status-error')) {
                     userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization in Google Cloud for your reCAPTCHA key, ensure the correct site key is used in Firebase, and check API enablement. See console for detailed logs from firebaseConfig.tsx.";
                 }
                  else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                     userFriendlyMessage += "Ensure App Check is configured correctly in Firebase Console (e.g., site key, debug token if local) and your environment is supported. Refreshing the page might help. Contact support if the issue persists. Check the browser console for Firebase hints.";
                 } else if (err.code.includes('app-not-authorized')) {
                     userFriendlyMessage += "This app is not authorized for sign-up. Check your Firebase project setup, including authorized domains.";
                 } else {
                     userFriendlyMessage += "Please try again. Check the browser console for details.";
                 }
                 setError(userFriendlyMessage);
            } else {
                setError(`Sign up failed: ${err.message} (Code: ${err.code}). Please try again or contact support if the issue persists.`);
            }
        } else {
            console.error("An unexpected error occurred during sign up:", err);
            setError('An unexpected error occurred during sign up. Please try again.');
        }
    } finally {
      setLoading(false);
    }
  };

  const handleSendMfaCode = async () => {
      if (!selectedMfaHint || !mfaResolver) {
          setError("Could not initiate MFA verification. Select a phone number and try again.");
          return;
      }
      if (!recaptchaVerifier) {
           setError("reCAPTCHA verifier is not ready. Please wait and try again. If this persists, ensure the reCAPTCHA container is visible and there are no console errors related to its rendering.");
           console.error("Cannot send MFA code, recaptchaVerifier is null or not rendered.");
           return;
      }
       if (!appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
         console.warn("App Check not initialized. Sending MFA code might fail if App Check is enforced.");
         setError("App Check is not ready. MFA code sending cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error'.");
         return;
       }

      setError(null);
      setIsSendingMfaCode(true);
      setLoadingMessage('Sending verification code...');

      try {
          if (!auth) throw new Error("Firebase Auth not initialized for MFA."); // Guard
          console.log("Requesting MFA code for hint:", selectedMfaHint.uid);
          const phoneInfoOptions = {
              multiFactorHint: selectedMfaHint,
              session: mfaResolver.session
          };
          const phoneAuthProvider = new PhoneAuthProvider(auth);

          console.log("Calling phoneAuthProvider.verifyPhoneNumber with reCAPTCHA verifier...");
          const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
           console.log("Verification ID received:", verificationId);
           setMfaVerificationId(verificationId);
           // setMfaConfirmationResult(null); // Not used
           setLoadingMessage('Verification code sent. Enter the code below.');

      } catch (err: any) {
          console.error("Error sending MFA code:", err);
          if (err instanceof FirebaseError) {
              if (err.code === 'auth/network-request-failed') {
                   console.error("Sending MFA code failed due to a network error:", err.code, err.message);
                   setError('Failed to send verification code: A network error occurred. Please check your internet connection, firewall, or proxy settings. Also, verify that Firebase services are operational at status.firebase.google.com.');
              } else if (err.code.includes('recaptcha') || err.code.includes('app-check') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                   console.error(`App Check/reCAPTCHA Error during MFA code sending (${err.code}):`, err.message);
                   let userFriendlyMessage = `Failed to send verification code due to a security check (${err.code}). `;
                     if (err.code.includes('recaptcha-error')) {
                         userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized in Google Cloud, reCAPTCHA Enterprise API not enabled, reCAPTCHA container not rendered) or your network connection. Please try again or contact support. Check the browser console for more Firebase hints.";
                     } else if (err.code.includes('fetch-status-error')) {
                        userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization in Google Cloud for your reCAPTCHA key, ensure the correct site key is used in Firebase, and check API enablement. See console for detailed logs from firebaseConfig.tsx.";
                     }
                     else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                         userFriendlyMessage += "Ensure App Check is configured correctly in Firebase Console (e.g., site key, debug token if local) and your environment is supported. Refreshing the page might help. Contact support if the issue persists. Check the browser console for Firebase hints.";
                     } else if (err.code.includes('app-not-authorized')) {
                         userFriendlyMessage += "This app is not authorized for this operation. Check your Firebase project setup, including authorized domains.";
                     } else {
                          userFriendlyMessage += "Please try again. Check the browser console for details.";
                      }
                     setError(userFriendlyMessage);
              } else if (err.code === 'auth/invalid-phone-number') {
                   setError("Invalid phone number format provided for MFA.");
              } else if (err.code === 'auth/too-many-requests') {
                   setError("Too many verification code requests. Please wait a while before trying again.");
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
           if (window.grecaptcha && recaptchaWidgetId !== null && typeof window.grecaptcha.reset === 'function') {
               try {
                  // @ts-ignore
                   window.grecaptcha.reset(recaptchaWidgetId);
                   console.log("reCAPTCHA widget reset after attempting to send MFA code.");
               } catch (e) {
                   console.warn("Could not reset reCAPTCHA widget after sending MFA code:", e);
               }
           } else {
               console.log("No active reCAPTCHA widget to reset or reset function unavailable.");
           }
      }
  };
 const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);

  const handleVerifyMfaCode = async () => {
      if (!mfaVerificationCode || !mfaResolver || !mfaVerificationId) {
          setError("Missing information to verify the code. Please request a new code and try again.");
          return;
      }
      if (!appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
        console.warn("App Check not initialized. Verifying MFA code might fail if App Check is enforced.");
        setError("App Check is not ready. MFA code verification cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error'.");
        return;
      }

      setError(null);
      setIsVerifyingMfaCode(true);
      setLoadingMessage('Verifying code...');

      try {
          console.log("Verifying MFA code...");
          const cred = PhoneMultiFactorGenerator.assertion(
              mfaVerificationId,
              mfaVerificationCode
          );
          const userCredential = await mfaResolver.resolveSignIn(cred);
          console.log("MFA verification successful, signed in:", userCredential.user?.uid);
          setLoadingMessage('Login successful!');
          router.push('/');

      } catch (err: any) {
          console.error("Error verifying MFA code:", err);
           if (err instanceof FirebaseError) {
                if (err.code === 'auth/invalid-verification-code') {
                   setError("Invalid verification code. Please try again.");
                } else if (err.code === 'auth/code-expired') {
                     setError("Verification code has expired. Please request a new one.");
                     setIsMFAPrompt(true);
                     setSelectedMfaHint(null);
                     setMfaVerificationId(null);
                     setMfaVerificationCode('');
                     setLoadingMessage(null);
                } else if (err.code === 'auth/network-request-failed') {
                     console.error("MFA code verification failed due to a network error:", err.code, err.message);
                     setError('MFA verification failed: A network error occurred. Please check your internet connection, firewall, or proxy settings. Also, verify that Firebase services are operational at status.firebase.google.com.');
                } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                    console.error(`App Check/reCAPTCHA Error during MFA verification (${err.code}):`, err.message);
                    let userFriendlyMessage = `MFA verification failed due to a security check (${err.code}). `;
                      if (err.code.includes('recaptcha-error')) {
                          userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized in Google Cloud, reCAPTCHA Enterprise API not enabled) or your network connection. Please try again or contact support. Check the browser console for more Firebase hints.";
                      } else if (err.code.includes('fetch-status-error')) {
                         userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization in Google Cloud for your reCAPTCHA key, ensure the correct site key is used in Firebase, and check API enablement. See console for detailed logs from firebaseConfig.tsx.";
                      }
                       else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                          userFriendlyMessage += "Ensure App Check is configured correctly in Firebase Console (e.g., site key, debug token if local) and your environment is supported. Refreshing the page might help. Contact support if the issue persists. Check the browser console for Firebase hints.";
                      } else if (err.code.includes('app-not-authorized')) {
                           userFriendlyMessage += "This app is not authorized for this operation. Check your Firebase project setup, including authorized domains.";
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
    setLoading(true);
     setLoadingMessage('Sending password reset email...');

    if (!appInitialized || !authInitialized || !auth) {
      setError(
        'Firebase is not properly initialized. Cannot send password reset email. Check your Firebase setup and environment variables.'
      );
      setLoading(false);
      setLoadingMessage(null);
      return;
    }
     if (!appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
       console.warn("App Check not initialized. Password reset might fail if App Check is enforced.");
       setError("App Check is not ready. Password reset cannot proceed. Please wait a moment and try again. If the problem persists, check the browser console for 'appCheck/recaptcha-error' or debug token issues, and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).");
       setLoading(false);
       setLoadingMessage(null);
       return;
     }

    try {
      console.log("Calling sendPasswordResetEmail...");
      await sendPasswordResetEmail(auth, email);
      console.log("Password reset email sent successfully to:", email);
      setSuccessMessage(
        `Password reset email sent to ${email}. Please check your inbox (and spam folder).`
      );
    } catch (err: any) {
       setLoadingMessage(null);
       if (err instanceof FirebaseError) {
           console.error("Password Reset Error:", err.code, err.message);
           if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
               setError(
                   'Email address not found or is invalid. Please enter a registered email address.'
               );
           } else if (err.code === 'auth/network-request-failed') {
                console.error("Password reset failed due to a network error:", err.code, err.message);
                setError('Password reset failed: A network error occurred. Please check your internet connection, firewall, or proxy settings. Also, verify that Firebase services are operational at status.firebase.google.com.');
           } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
               console.error(`App Check/reCAPTCHA Error during password reset (${err.code}):`, err.message);
                let userFriendlyMessage = `Password reset failed due to a security check (${err.code}). `;
                 if (err.code.includes('recaptcha-error')) {
                     userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (e.g., invalid key, domain not authorized in Google Cloud, reCAPTCHA Enterprise API not enabled) or your network connection. Please try again or contact support. Check the browser console for more Firebase hints.";
                 } else if (err.code.includes('fetch-status-error')) {
                    userFriendlyMessage += "App Check server rejected the request (403). This is likely a configuration issue. Verify domain authorization in Google Cloud for your reCAPTCHA key, ensure the correct site key is used in Firebase, and check API enablement. See console for detailed logs from firebaseConfig.tsx.";
                 }
                 else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                     userFriendlyMessage += "Ensure App Check is configured correctly in Firebase Console (e.g., site key, debug token if local) and your environment is supported. Refreshing the page might help. Contact support if the issue persists. Check the browser console for Firebase hints.";
                 } else if (err.code.includes('app-not-authorized')) {
                    userFriendlyMessage += "This app is not authorized for password reset. Check your Firebase project setup, including authorized domains.";
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
           console.error("An unexpected error occurred during password reset:", err);
            setError(`An unexpected error occurred during password reset (${err.message}). Please try again.`);
       }
    } finally {
      setLoading(false);
    }
  };

  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp);
    setIsForgotPassword(false);
    setError(null);
    setSuccessMessage(null);
    setEmail('');
    setPassword('');
    setIsMFAPrompt(false);
    setMfaResolver(null);
    setMfaHints([]);
    setSelectedMfaHint(null);
    setMfaVerificationCode('');
    // setMfaConfirmationResult(null); // Not used
    setMfaVerificationId(null);
  };

  const showForgotPassword = () => {
    setIsForgotPassword(true);
    setIsSignUp(false);
    setError(null);
    setSuccessMessage(null);
    setPassword('');
     setIsMFAPrompt(false);
     setMfaResolver(null);
     setMfaHints([]);
     setSelectedMfaHint(null);
     setMfaVerificationCode('');
     // setMfaConfirmationResult(null); // Not used
     setMfaVerificationId(null);
  };

  const showLogin = () => {
    setIsForgotPassword(false);
    setIsSignUp(false);
    setError(null);
    setSuccessMessage(null);
    setPassword('');
     setIsMFAPrompt(false);
     setMfaResolver(null);
     setMfaHints([]);
     setSelectedMfaHint(null);
     setMfaVerificationCode('');
     // setMfaConfirmationResult(null); // Not used
     setMfaVerificationId(null);
  };
  
  const isAuthDisabled = loading || !authInitialized || !auth || (!appCheckInitialized && !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY);


  return (
    <div className="flex justify-center items-center min-h-screen bg-muted/40">
      <div className="bg-card text-card-foreground p-8 rounded-lg shadow-lg w-full max-w-md border">

        {loading && (
          <Alert variant="default" className="mb-4 bg-blue-50 border-blue-200 text-blue-800">
            <Icons.loader className="h-4 w-4 animate-spin" />
            <AlertTitle>Processing...</AlertTitle>
            <AlertDescription suppressHydrationWarning={true}>
              {loadingMessage || 'Please wait...'}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <Icons.alertCircle className="h-4 w-4" />
            <AlertTitle>{isSignUp ? 'Sign Up Error' : isForgotPassword ? 'Reset Password Error' : isMFAPrompt ? 'MFA Error' : error.includes("App Check") || error.includes("Security Alert") ? 'Security Initialization Error' : 'Login Error'}</AlertTitle>
            <AlertDescription suppressHydrationWarning={true}>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert variant="default" className="mb-4 bg-green-100 border-green-300 text-green-800">
            <Icons.check className="h-4 w-4" />
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
                  onChange={(e) => setEmail(e.target.value)} required disabled={isAuthDisabled} suppressHydrationWarning={true}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" htmlFor="password-login">Password</label>
                <Input
                  className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                  id="password-login" type="password" placeholder="••••••••" value={password}
                  onChange={(e) => setPassword(e.target.value)} required disabled={isAuthDisabled} suppressHydrationWarning={true}
                />
              </div>
              <div className="flex items-center justify-between mb-4">
                <Button className="w-full" type="submit" disabled={isAuthDisabled} suppressHydrationWarning={true}>
                  {loading ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.login className="mr-2 h-4 w-4" />}
                  Login
                </Button>
              </div>
              <div className="text-center space-y-2">
                <Button type="button" variant="link" onClick={showForgotPassword} className="text-sm" disabled={isAuthDisabled} suppressHydrationWarning={true}>
                  Forgot Password?
                </Button>
                 <p className="text-sm text-muted-foreground">
                   Don't have an account?{' '}
                   <Button type="button" variant="link" onClick={toggleAuthMode} className="text-sm p-0 h-auto" disabled={isAuthDisabled} suppressHydrationWarning={true}>
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
                    onChange={(e) => setEmail(e.target.value)} required disabled={isAuthDisabled} suppressHydrationWarning={true}
                  />
              </div>
              <div className="mb-6">
                  <label className="block text-sm font-medium mb-2" htmlFor="password-signup">Password</label>
                  <Input
                    className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                    id="password-signup" type="password" placeholder="Choose a strong password" value={password}
                    onChange={(e) => setPassword(e.target.value)} required disabled={isAuthDisabled} suppressHydrationWarning={true}
                  />
              </div>
              <div className="flex items-center justify-between mb-4">
                <Button className="w-full" type="submit" disabled={isAuthDisabled} suppressHydrationWarning={true}>
                  {loading ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.user className="mr-2 h-4 w-4" />}
                  Sign Up
                </Button>
              </div>
              <div className="text-center">
                 <p className="text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <Button type="button" variant="link" onClick={showLogin} className="text-sm p-0 h-auto" disabled={isAuthDisabled} suppressHydrationWarning={true}>
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
                  onChange={(e) => setEmail(e.target.value)} required disabled={isAuthDisabled} suppressHydrationWarning={true}
                />
              </div>
              <div className="flex items-center justify-between mb-4">
                <Button className="w-full" type="submit" disabled={isAuthDisabled} suppressHydrationWarning={true}>
                  {loading ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.mail className="mr-2 h-4 w-4" />}
                  Send Reset Link
                </Button>
              </div>
              <div className="text-center">
                <Button type="button" variant="link" onClick={showLogin} className="text-sm" disabled={isAuthDisabled} suppressHydrationWarning={true}>
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
                   {mfaHints.map((hint, index) => (
                     <Button
                       key={hint.uid}
                       variant="outline"
                       className="w-full justify-start"
                       onClick={() => setSelectedMfaHint(hint)}
                       disabled={isSendingMfaCode || (!appCheckInitialized && !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY)} suppressHydrationWarning={true}
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
                        disabled={!selectedMfaHint || isSendingMfaCode || !recaptchaVerifier || (!appCheckInitialized && !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY)}
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
                             onChange={(e) => setMfaVerificationCode(e.target.value)} required disabled={isVerifyingMfaCode || (!appCheckInitialized && !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY)} suppressHydrationWarning={true}
                           />
                       </div>
                       <div className="flex items-center justify-between mb-4">
                           <Button
                             className="w-full"
                             type="submit"
                             disabled={isVerifyingMfaCode || (!appCheckInitialized && !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY)}
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
                                    setMfaVerificationId(null);
                                    setSelectedMfaHint(null);
                                    setMfaVerificationCode('');
                                    setError(null);
                                    setLoadingMessage(null);
                                }}
                                disabled={isSendingMfaCode || isVerifyingMfaCode}
                                suppressHydrationWarning={true}
                            >
                                Request a new code
                            </Button>
                        </div>
                  </form>
               </>
             )}

            <div className="text-center mt-4">
                <Button type="button" variant="link" onClick={showLogin} className="text-sm" disabled={isAuthDisabled} suppressHydrationWarning={true}>
                  Cancel MFA / Back to Login
                </Button>
            </div>
          </>
        )}

         <div ref={recaptchaContainerRef} id="recaptcha-container-mfa" className="my-4"></div>

      </div>
    </div>
  );
};

export default AuthPage;

    