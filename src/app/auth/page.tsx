
'use client';

import { useState, useEffect, useRef } from 'react'; // Added useEffect and useRef
import { useRouter } from 'next/navigation';
import {
  RecaptchaVerifier,
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  PhoneAuthProvider,
  // signInWithPhoneNumber, // No longer used directly for MFA resolution
  getMultiFactorResolver, // Import for MFA
  PhoneMultiFactorGenerator, // Import for MFA phone assertion
  // MultiFactorError is not always directly exported, check error.code instead
  PhoneMultiFactorInfo, // Import to type hints
  ConfirmationResult, // Explicit import
  UserCredential, // Explicit import
  createUserWithEmailAndPassword, // Import sign-up function
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app'; // Import base FirebaseError for type checking
import { app, appInitialized, appCheckInitialized } from '../firebaseConfig'; // Import appCheckInitialized
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Icons } from '@/components/icons';

// Initialize auth only if app is initialized
const auth = appInitialized ? getAuth(app) : null;

// Global variable for RecaptchaVerifier to avoid re-rendering issues
// @ts-ignore
let recaptchaVerifier: RecaptchaVerifier | null = null;
// @ts-ignore
let recaptchaWidgetId: number | null = null;


type AuthPageProps = {};

const AuthPage = ({}: AuthPageProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false); // State to toggle between Login and Sign Up
  const [isForgotPassword, setIsForgotPassword] = useState(false); // State for forgot password mode
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // State for success messages
  const [loading, setLoading] = useState(false); // Loading state for primary action
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null); // Specific loading message


  // MFA states
  const [isMFAPrompt, setIsMFAPrompt] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<any>(null); // Type should be MultiFactorResolver
  const [mfaHints, setMfaHints] = useState<PhoneMultiFactorInfo[]>([]);
  const [selectedMfaHint, setSelectedMfaHint] =
    useState<PhoneMultiFactorInfo | null>(null);
  const [mfaVerificationCode, setMfaVerificationCode] = useState('');
  const [mfaConfirmationResult, setMfaConfirmationResult] =
    useState<ConfirmationResult | null>(null); // State for MFA code confirmation
   const [isSendingMfaCode, setIsSendingMfaCode] = useState(false); // Loading state for sending MFA code
   const [isVerifyingMfaCode, setIsVerifyingMfaCode] = useState(false); // Loading state for verifying MFA code
   const recaptchaContainerRef = useRef<HTMLDivElement>(null); // Ref for the reCAPTCHA container

  const router = useRouter();

  useEffect(() => {
    // This effect sets an initial error if App Check failed during startup.
    // It runs when appInitialized or appCheckInitialized status changes, or if an error is already set (to avoid overwriting).
    if (appInitialized && !appCheckInitialized && !error) {
      setError(
        "App Check Security Alert: Initialization failed. Functionality will be limited. " +
        "Check the browser console for detailed error messages (e.g., 'appCheck/recaptcha-error' or debug token issues). " +
        "Verify your reCAPTCHA Enterprise setup in Google Cloud & Firebase project settings."
      );
    }
    // Note: We don't clear the error here if appCheckInitialized becomes true later,
    // as other unrelated errors might have been set by user actions.
    // Specific actions should clear their own errors upon success.
  }, [appInitialized, appCheckInitialized, error]);


   // Initialize reCAPTCHA only once when the component mounts
   useEffect(() => {
     if (!appInitialized || !auth || !recaptchaContainerRef.current) {
       console.warn("Skipping reCAPTCHA setup: Firebase not ready or container not found.");
       return;
      }

     // Cleanup previous verifier if it exists and clear the container
     if (recaptchaVerifier && recaptchaVerifier.clear) {
       console.log("Clearing previous reCAPTCHA verifier.");
       recaptchaVerifier.clear();
     }
     if (recaptchaContainerRef.current) {
        recaptchaContainerRef.current.innerHTML = ''; // Ensure container is empty before rendering
     }
      // Reset widget ID state
      // @ts-ignore
     recaptchaWidgetId = null;

     // Only create a new verifier if one doesn't exist or needs re-creation
      try {
        console.log("Initializing new RecaptchaVerifier...");
         recaptchaVerifier = new RecaptchaVerifier(auth,
           recaptchaContainerRef.current, // Use the ref here
           {
             size: 'invisible',
             callback: (response: any) => {
               // reCAPTCHA solved, allow signInWithPhoneNumber.
               console.log("reCAPTCHA verified automatically (invisible callback).");
               // NOTE: For MFA, the verification happens when phoneAuthProvider.verifyPhoneNumber is called.
             },
             'expired-callback': () => {
               // Response expired. Ask user to solve reCAPTCHA again.
               console.warn("reCAPTCHA expired, need to re-verify.");
               // For invisible reCAPTCHA, it often re-verifies automatically on the next action.
               // If issues persist, might need to explicitly reset/re-render here.
                setError("reCAPTCHA challenge expired. Please try the action again.");
                // Reset relevant states if necessary
                setIsSendingMfaCode(false);
                setLoadingMessage(null);
             }
           }
         );

         // Render the verifier and store the widget ID
         recaptchaVerifier.render().then((widgetId) => {
            if (widgetId !== undefined) { // Check if widgetId is valid
                 // @ts-ignore
                recaptchaWidgetId = widgetId;
                console.log("reCAPTCHA rendered successfully, widget ID:", widgetId);
            } else {
                 console.warn("reCAPTCHA rendered but returned undefined widget ID.");
            }
         }).catch(err => {
             console.error("reCAPTCHA render error:", err);
             // Check for specific errors like already rendered
            if (err.message && err.message.includes('already rendered')) {
                 console.warn("reCAPTCHA was likely already rendered in the container.");
                 // Attempt cleanup and maybe retry logic if needed, but often indicates a state issue
            } else {
                setError("Failed to render reCAPTCHA. Phone authentication may fail.");
            }
         });

      } catch (err) {
          console.error("Error creating RecaptchaVerifier:", err);
          setError("Failed to initialize reCAPTCHA verifier. Authentication involving phone may fail.");
      }


     // Cleanup function to clear the verifier when component unmounts
     return () => {
        if (recaptchaVerifier && recaptchaVerifier.clear) {
            console.log("Clearing reCAPTCHA verifier on component unmount.");
            recaptchaVerifier.clear();
            recaptchaVerifier = null; // Ensure it's reset
             // @ts-ignore
            recaptchaWidgetId = null;
        }
         // Explicitly remove the reCAPTCHA container content on unmount
         if (recaptchaContainerRef.current) {
             recaptchaContainerRef.current.innerHTML = '';
         }
     };
   }, [appInitialized, auth]); // Depend on auth and appInitialized

  // Function to handle login
  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    setLoadingMessage('Logging in...');


    if (!appInitialized || !auth) {
      setError(
        'Firebase could not be initialized. Check your environment variables and try again.'
      );
      setLoading(false);
      setLoadingMessage(null);
      return;
    }
     if (!appCheckInitialized) {
       console.warn("App Check not initialized. Authentication might fail if App Check is enforced.");
       // The useEffect above should have already set a more general App Check error.
       // This provides a more immediate feedback if user tries to submit.
       setError("App Check is not ready. Please wait a moment and try again. If the problem persists, check the console for errors and verify your Firebase/Google Cloud App Check configuration.");
       setLoading(false);
       setLoadingMessage(null);
       return;
     }

    try {
      console.log("Calling signInWithEmailAndPassword...");
      // IMPORTANT: Ensure Email/Password sign-in is enabled in Firebase Console.
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // If successful without MFA error, redirect (or handle non-MFA users)
      console.log("Sign in successful (no MFA required or handled):", userCredential.user?.uid);
      setLoadingMessage('Login successful!');
      router.push('/'); // Redirect to dashboard or home page
    } catch (err: any) {
      setLoadingMessage(null); // Clear loading message on error
      // Check if it's a FirebaseError first
      if (err instanceof FirebaseError) {
          // Log Firebase errors always for better debugging
          console.error("Login error (FirebaseError):", err.code, err.message);

          // Check if it's a MultiFactorError by checking the code
          if (err.code === 'auth/multi-factor-auth-required') {
              console.log("MFA required, proceeding to second factor."); // Log specific MFA case
              setError(null); // Clear general login error
              try {
                   const resolver = getMultiFactorResolver(auth, err);
                   if (resolver) {
                     console.log("MFA resolver obtained:", resolver);
                     setMfaResolver(resolver);
                     // Filter for phone hints specifically
                     const phoneHints = resolver.hints.filter(
                       (hint): hint is PhoneMultiFactorInfo => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
                     );
                      console.log("Available MFA phone hints:", phoneHints);
                     setMfaHints(phoneHints);
                     setIsMFAPrompt(true); // Show MFA UI
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
          } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                // More specific App Check/reCAPTCHA error logging
                console.error(`App Check/reCAPTCHA Error during login (${err.code}):`, err.message);
                let userFriendlyMessage = `Authentication failed due to a security check (${err.code}). `;
                if (err.code.includes('recaptcha-error')) {
                    userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (invalid key, domain not authorized in Google Cloud, API not enabled) or network connection. Please try again or contact support. Check console for more Firebase hints.";
                } else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                    userFriendlyMessage += "Ensure App Check is configured correctly (check Firebase Console, site key, debug token if local) and your environment is supported. Refreshing the page might help. Contact support if the issue persists. Check console for more Firebase hints.";
                } else if (err.code.includes('app-not-authorized')) {
                    userFriendlyMessage += "This app is not authorized to use Firebase Authentication. Check your Firebase project setup and authorized domains.";
                }
                 else {
                     userFriendlyMessage += "Please try again. Check console for more details.";
                 }
                setError(userFriendlyMessage);
           } else {
              // General Firebase error
              setError(`Login failed: ${err.message} (Code: ${err.code})`);
          }
      } else {
        // Handle non-Firebase errors
        console.error("An unexpected error occurred during login:", err);
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false); // Ensure loading state is reset
    }
  };


  // Function to handle Sign Up
  const handleSignUpSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    setLoadingMessage('Creating account...');

    if (!appInitialized || !auth) {
      setError(
        'Firebase could not be initialized. Check your environment variables and try again.'
      );
      setLoading(false);
      setLoadingMessage(null);
      return;
    }
     if (!appCheckInitialized) {
       console.warn("App Check not initialized. Sign-up might fail if App Check is enforced.");
        setError("App Check is not ready. Please wait a moment and try again. If the problem persists, check the console for errors and verify your Firebase/Google Cloud App Check configuration.");
        setLoading(false);
        setLoadingMessage(null);
        return;
     }

    try {
      console.log("Calling createUserWithEmailAndPassword...");
      // IMPORTANT: Ensure Email/Password sign-in method is enabled in Firebase Auth Console
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log("Sign up successful:", userCredential.user?.uid);
      // Optionally, redirect to a profile setup page or directly to the app
      // For now, switch back to login mode with a success message
      setIsSignUp(false); // Switch back to login view
      setSuccessMessage('Account created successfully! Please log in.');
      setEmail(''); // Clear fields for login
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
            } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                 // Specific App Check/reCAPTCHA error logging for sign up
                 console.error(`App Check/reCAPTCHA Error during sign up (${err.code}):`, err.message);
                 let userFriendlyMessage = `Sign up failed due to a security check (${err.code}). `;
                 if (err.code.includes('recaptcha-error')) {
                    userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (invalid key, domain not authorized, API not enabled) or network connection. Please try again or contact support. Check console for more Firebase hints.";
                 } else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                     userFriendlyMessage += "Ensure App Check is configured correctly (check Firebase Console, site key, debug token). Refreshing might help. Contact support if the issue persists. Check console for more Firebase hints.";
                 } else if (err.code.includes('app-not-authorized')) {
                     userFriendlyMessage += "This app is not authorized for sign-up. Check Firebase project setup.";
                 }
                  else {
                     userFriendlyMessage += "Please try again. Check console for details.";
                 }
                 setError(userFriendlyMessage);
            }
            else {
                setError(`Sign up failed: ${err.message} (Code: ${err.code})`);
            }
        } else {
            console.error("An unexpected error occurred during sign up:", err);
            setError('An unexpected error occurred during sign up. Please try again.');
        }
    } finally {
      setLoading(false);
    }
  };


  // Function to handle sending MFA verification code
  const handleSendMfaCode = async () => {
      if (!selectedMfaHint || !mfaResolver) {
          setError("Could not initiate MFA verification. Select a phone number and try again.");
          return;
      }
      if (!recaptchaVerifier) {
           setError("reCAPTCHA verifier is not ready. Please wait and try again.");
           console.error("Cannot send MFA code, recaptchaVerifier is null or not rendered.");
           // Optionally, try to re-render reCAPTCHA here, but it's complex and might indicate a deeper issue.
           return;
      }
       // Check App Check initialization before proceeding with phone auth
       if (!appCheckInitialized) {
         console.warn("App Check not initialized. Sending MFA code might fail if App Check is enforced.");
         setError("App Check is not ready. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration.");
         return; // Don't proceed without App Check
       }

      setError(null);
      setIsSendingMfaCode(true);
      setLoadingMessage('Sending verification code...');


      try {
          console.log("Requesting MFA code for hint:", selectedMfaHint.uid);
          const phoneInfoOptions = {
              multiFactorHint: selectedMfaHint,
              session: mfaResolver.session // Required for MFA resolution
          };
          const phoneAuthProvider = new PhoneAuthProvider(auth);

          console.log("Calling phoneAuthProvider.verifyPhoneNumber with reCAPTCHA verifier...");
          // Make sure reCAPTCHA is verified - pass the global/ref'd verifier
          const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
          // If verifyPhoneNumber resolves, it means reCAPTCHA was likely passed implicitly or explicitly

           console.log("Verification ID received:", verificationId);
           // Store verificationId and show code input field
           setMfaVerificationId(verificationId); // Use state to store verification ID
           setMfaConfirmationResult(null); // Clear any old confirmation result
           setLoadingMessage('Verification code sent. Enter the code below.');


      } catch (err: any) {
          console.error("Error sending MFA code:", err);
          if (err instanceof FirebaseError) {
              if (err.code.includes('recaptcha') || err.code.includes('app-check') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                   console.error(`App Check/reCAPTCHA Error during MFA code sending (${err.code}):`, err.message);
                   let userFriendlyMessage = `Failed to send verification code due to a security check (${err.code}). `;
                     if (err.code.includes('recaptcha-error')) {
                         userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (invalid key, unauthorized domain, API not enabled) or network connection. Please contact support. Check console for more Firebase hints.";
                     } else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                         userFriendlyMessage += "Ensure App Check is configured correctly (check Firebase Console, site key, debug token). Refreshing might help. Contact support. Check console for more Firebase hints.";
                     } else if (err.code.includes('app-not-authorized')) {
                         userFriendlyMessage += "This app is not authorized for this operation. Check Firebase project setup.";
                     }
                      else {
                          userFriendlyMessage += "Please try again. Check console for details.";
                      }
                     setError(userFriendlyMessage);
              } else if (err.code === 'auth/invalid-phone-number') {
                   setError("Invalid phone number format provided for MFA.");
              } else if (err.code === 'auth/too-many-requests') {
                   setError("Too many verification code requests. Please wait a while before trying again.");
              } else {
                   setError(`Failed to send verification code: ${err.message} (Code: ${err.code})`);
              }
          } else {
              setError(`Failed to send verification code: ${err.message}`);
          }
          setLoadingMessage(null);
      } finally {
          setIsSendingMfaCode(false);
           // Explicitly reset reCAPTCHA widget after attempt if needed, though invisible often handles this.
           // This might help if encountering persistent reCAPTCHA issues.
           if (window.grecaptcha && recaptchaWidgetId !== null) {
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
 // Add state for verification ID from verifyPhoneNumber
 const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);


  // Function to handle MFA code verification
  const handleVerifyMfaCode = async () => {
      // Use mfaVerificationId state here
      if (!mfaVerificationCode || !mfaResolver || !mfaVerificationId) {
          setError("Missing information to verify the code. Please try again.");
          return;
      }
      // Check App Check initialization before verifying MFA code
      if (!appCheckInitialized) {
        console.warn("App Check not initialized. Verifying MFA code might fail if App Check is enforced.");
        setError("App Check is not ready. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration.");
        return; // Don't proceed without App Check
      }

      setError(null);
      setIsVerifyingMfaCode(true);
      setLoadingMessage('Verifying code...');


      try {
          console.log("Verifying MFA code...");
          // Build the assertion object using the PhoneMultiFactorGenerator
          const cred = PhoneMultiFactorGenerator.assertion(
              mfaVerificationId, // Use the stored verification ID
              mfaVerificationCode
          );

          // Complete the sign-in process using the resolver and the phone assertion
          const userCredential = await mfaResolver.resolveSignIn(cred);
          console.log("MFA verification successful, signed in:", userCredential.user?.uid);
          setLoadingMessage('Login successful!');
          router.push('/'); // Redirect to dashboard or home page

      } catch (err: any) {
          console.error("Error verifying MFA code:", err);
           if (err instanceof FirebaseError) {
                if (err.code === 'auth/invalid-verification-code') {
                   setError("Invalid verification code. Please try again.");
                } else if (err.code === 'auth/code-expired') {
                     setError("Verification code has expired. Please request a new one.");
                     // Reset MFA state to request a new code
                     setIsMFAPrompt(true); // Stay on MFA prompt
                     setSelectedMfaHint(null); // Force re-selection
                     setMfaVerificationId(null); // Clear old ID
                     setMfaVerificationCode(''); // Clear old code
                     setLoadingMessage(null); // Clear loading message
                     // Should we reset reCAPTCHA here too? Likely handled by handleSendMfaCode reset.
                } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
                    console.error(`App Check/reCAPTCHA Error during MFA verification (${err.code}):`, err.message);
                    let userFriendlyMessage = `MFA verification failed due to a security check (${err.code}). `;
                      if (err.code.includes('recaptcha-error')) {
                          userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (invalid key, domain, API) or network connection. Contact support. Check console for more Firebase hints.";
                      } else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                          userFriendlyMessage += "Ensure App Check is configured correctly (Firebase Console, site key, debug token). Refreshing might help. Contact support. Check console for more Firebase hints.";
                      } else if (err.code.includes('app-not-authorized')) {
                          userFriendlyMessage += "This app is not authorized for this operation. Check Firebase project setup.";
                      }
                       else {
                          userFriendlyMessage += "Please try again. Check console for details.";
                      }
                     setError(userFriendlyMessage);
                }
                 else {
                     setError(`MFA verification failed: ${err.message} (Code: ${err.code})`);
                 }
           } else {
                setError("An unexpected error occurred during MFA verification.");
           }
          setLoadingMessage(null);
      } finally {
          setIsVerifyingMfaCode(false);
      }
  };


  // Function to handle Forgot Password
  const handleForgotPasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
     setLoadingMessage('Sending password reset email...');


    if (!appInitialized || !auth) {
      setError(
        'Firebase could not be initialized. Check your environment variables and try again.'
      );
      setLoading(false);
      setLoadingMessage(null);
      return;
    }
     // Check App Check initialization specifically for security-sensitive operations
     if (!appCheckInitialized) {
       console.warn("App Check not initialized. Password reset might fail if App Check is enforced.");
       setError("App Check is not ready. Please wait a moment and try again. If the problem persists, check the console for errors and verify your Firebase/Google Cloud App Check configuration.");
       setLoading(false);
       setLoadingMessage(null);
       return;
     }

    try {
      console.log("Calling sendPasswordResetEmail...");
      // Use the imported Firebase function directly
      // IMPORTANT: Ensure this action is allowed in your App Check rules if enforced.
      await sendPasswordResetEmail(auth, email);
      console.log("Password reset email sent successfully to:", email);
      setSuccessMessage(
        `Password reset email sent to ${email}. Please check your inbox (and spam folder).`
      );
      // Optional: Switch back to login after success?
      // setIsForgotPassword(false);
      // setEmail(''); // Clear email? Maybe not.
    } catch (err: any) {
       setLoadingMessage(null);
       if (err instanceof FirebaseError) {
           console.error("Password Reset Error:", err.code, err.message);
           if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
               setError(
                   'Email address not found or is invalid. Please enter a registered email address.'
               );
           } else if (err.code.includes('app-check') || err.code.includes('recaptcha') || err.code.includes('token-is-invalid') || err.code.includes('app-not-authorized')) {
               console.error(`App Check/reCAPTCHA Error during password reset (${err.code}):`, err.message);
                let userFriendlyMessage = `Password reset failed due to a security check (${err.code}). `;
                 if (err.code.includes('recaptcha-error')) {
                     userFriendlyMessage += "There might be an issue with the reCAPTCHA setup (invalid key, domain, API) or network connection. Contact support. Check console for more Firebase hints.";
                 } else if (err.code.includes('app-check') || err.code.includes('token-is-invalid')) {
                     userFriendlyMessage += "Ensure App Check is configured correctly (Firebase Console, site key, debug token). Refreshing might help. Contact support. Check console for more Firebase hints.";
                 } else if (err.code.includes('app-not-authorized')) {
                    userFriendlyMessage += "This app is not authorized for password reset. Check Firebase project setup.";
                 }
                 else {
                     userFriendlyMessage += "Please try again. Check console for details.";
                 }
                 setError(userFriendlyMessage);
           }
            else {
               setError(
                   `An error occurred sending the password reset email: ${err.message} (Code: ${err.code}). Please try again.`
               );
           }
       } else {
           console.error("An unexpected error occurred during password reset:", err);
            setError('An unexpected error occurred. Please try again.');
       }
    } finally {
      setLoading(false);
    }
  };

  // Function to toggle between Login and Sign Up modes
  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp);
    setIsForgotPassword(false); // Ensure forgot password mode is off when toggling
    setError(null); // Clear previous errors, new App Check error will be set by useEffect if needed
    setSuccessMessage(null);
    setEmail(''); // Clear fields on mode change
    setPassword('');
    // Reset MFA state if switching away from login
    setIsMFAPrompt(false);
    setMfaResolver(null);
    setMfaHints([]);
    setSelectedMfaHint(null);
    setMfaVerificationCode('');
    setMfaConfirmationResult(null);
    setMfaVerificationId(null);
  };

  // Function to switch to Forgot Password mode
  const showForgotPassword = () => {
    setIsForgotPassword(true);
    setIsSignUp(false); // Ensure sign up mode is off
    setError(null); // Clear previous errors
    setSuccessMessage(null);
    // Keep email if user already typed it, but clear password
    setPassword('');
     // Reset MFA state if switching away from login
     setIsMFAPrompt(false);
     setMfaResolver(null);
     setMfaHints([]);
     setSelectedMfaHint(null);
     setMfaVerificationCode('');
     setMfaConfirmationResult(null);
     setMfaVerificationId(null);
  };

  // Function to switch back to Login mode from Forgot Password or Sign Up
  const showLogin = () => {
    setIsForgotPassword(false);
    setIsSignUp(false);
    setError(null); // Clear previous errors
    setSuccessMessage(null);
    // Optionally clear fields, or keep email if coming from Forgot Password
    // setEmail('');
    setPassword('');
     // Reset MFA state just in case
     setIsMFAPrompt(false);
     setMfaResolver(null);
     setMfaHints([]);
     setSelectedMfaHint(null);
     setMfaVerificationCode('');
     setMfaConfirmationResult(null);
     setMfaVerificationId(null);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-muted/40">
      <div className="bg-card text-card-foreground p-8 rounded-lg shadow-lg w-full max-w-md border">

        {/* Loading Indicator */}
        {loading && (
          <Alert variant="default" className="mb-4 bg-blue-50 border-blue-200 text-blue-800">
            <Icons.loader className="h-4 w-4 animate-spin" />
            <AlertTitle>Processing...</AlertTitle>
            <AlertDescription suppressHydrationWarning={true}>
              {loadingMessage || 'Please wait...'}
            </AlertDescription>
          </Alert>
        )}


        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <Icons.alertCircle className="h-4 w-4" />
            <AlertTitle>{isSignUp ? 'Sign Up Error' : isForgotPassword ? 'Reset Password Error' : isMFAPrompt ? 'MFA Error' : error.includes("App Check") ? 'Security Initialization Error' : 'Login Error'}</AlertTitle>
            <AlertDescription suppressHydrationWarning={true}>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Message Display */}
        {successMessage && (
          <Alert variant="default" className="mb-4 bg-green-100 border-green-300 text-green-800">
            <Icons.check className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription suppressHydrationWarning={true}>{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Conditional Rendering based on state */}
        {!isMFAPrompt && !isForgotPassword && !isSignUp && (
          // Login Form
          <>
            <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
            <form onSubmit={handleLoginSubmit}>
              {/* Email Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" htmlFor="email-login">Email</label>
                <Input
                  className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                  id="email-login" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}
                />
              </div>
              {/* Password Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2" htmlFor="password-login">Password</label>
                <Input
                  className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                  id="password-login" type="password" placeholder="••••••••" value={password}
                  onChange={(e) => setPassword(e.target.value)} required disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}
                />
              </div>
              {/* Login Button */}
              <div className="flex items-center justify-between mb-4">
                <Button className="w-full" type="submit" disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}>
                  {loading ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.login className="mr-2 h-4 w-4" />}
                  Login
                </Button>
              </div>
              {/* Links */}
              <div className="text-center space-y-2">
                <Button type="button" variant="link" onClick={showForgotPassword} className="text-sm" disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}>
                  Forgot Password?
                </Button>
                 <p className="text-sm text-muted-foreground">
                   Don't have an account?{' '}
                   <Button type="button" variant="link" onClick={toggleAuthMode} className="text-sm p-0 h-auto" disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}>
                     Sign Up
                   </Button>
                 </p>
              </div>
            </form>
          </>
        )}

        {isSignUp && (
          // Sign Up Form
          <>
            <h2 className="text-2xl font-bold mb-6 text-center">Create Account</h2>
            <form onSubmit={handleSignUpSubmit}>
              {/* Email Input */}
              <div className="mb-4">
                  <label className="block text-sm font-medium mb-2" htmlFor="email-signup">Email</label>
                  <Input
                    className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                    id="email-signup" type="email" placeholder="you@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}
                  />
              </div>
              {/* Password Input */}
              <div className="mb-6">
                  <label className="block text-sm font-medium mb-2" htmlFor="password-signup">Password</label>
                  <Input
                    className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                    id="password-signup" type="password" placeholder="Choose a strong password" value={password}
                    onChange={(e) => setPassword(e.target.value)} required disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}
                  />
              </div>
              {/* Sign Up Button */}
              <div className="flex items-center justify-between mb-4">
                <Button className="w-full" type="submit" disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}>
                  {loading ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.user className="mr-2 h-4 w-4" />}
                  Sign Up
                </Button>
              </div>
              {/* Back to Login Link */}
              <div className="text-center">
                 <p className="text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <Button type="button" variant="link" onClick={showLogin} className="text-sm p-0 h-auto" disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}>
                      Login
                    </Button>
                  </p>
              </div>
            </form>
          </>
        )}

        {isForgotPassword && (
          // Forgot Password Form
          <>
            <h2 className="text-2xl font-bold mb-6 text-center">Reset Password</h2>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Enter your registered email address below and we'll send you a link to reset your password.
            </p>
            <form onSubmit={handleForgotPasswordSubmit}>
              {/* Email Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" htmlFor="email-forgot">Email</label>
                <Input
                  className="shadow-sm appearance-none border rounded w-full py-2 px-3 leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
                  id="email-forgot" type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}
                />
              </div>
              {/* Send Reset Link Button */}
              <div className="flex items-center justify-between mb-4">
                <Button className="w-full" type="submit" disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}>
                  {loading ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.mail className="mr-2 h-4 w-4" />}
                  Send Reset Link
                </Button>
              </div>
              {/* Back to Login Link */}
              <div className="text-center">
                <Button type="button" variant="link" onClick={showLogin} className="text-sm" disabled={loading || !auth || !appCheckInitialized} suppressHydrationWarning={true}>
                  Back to Login
                </Button>
              </div>
            </form>
          </>
        )}

        {isMFAPrompt && (
          // MFA Prompt
          <>
            <h2 className="text-2xl font-bold mb-6 text-center">Multi-Factor Authentication</h2>
            {!selectedMfaHint && mfaHints.length > 0 && !mfaVerificationId && (
               // Step 1: Select MFA method (Phone in this case)
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
                       disabled={isSendingMfaCode} suppressHydrationWarning={true}
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
                        onClick={handleSendMfaCode} // Button to trigger sending code after selection
                        disabled={!selectedMfaHint || isSendingMfaCode || !recaptchaVerifier || !appCheckInitialized} // Add App Check check
                        suppressHydrationWarning={true}
                       >
                         {isSendingMfaCode ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.messageSquare className="mr-2 h-4 w-4" />}
                         Send Code to Selected Number
                       </Button>
                 </div>
               </>
            )}

             {!selectedMfaHint && mfaHints.length === 0 && !mfaVerificationId && (
                // Handle case where user requires MFA but has no enrolled factors
                 <Alert variant="destructive" className="mb-4">
                     <Icons.alertCircle className="h-4 w-4" />
                     <AlertTitle>MFA Setup Required</AlertTitle>
                     <AlertDescription suppressHydrationWarning={true}>
                        Multi-factor authentication is required, but you haven't set up a second factor (like a phone number) yet. Please contact support or your administrator to enroll a second factor.
                     </AlertDescription>
                 </Alert>
             )}

            {/* Step 2: Enter Verification Code */}
            {/* Show this part only after handleSendMfaCode sets mfaVerificationId */}
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
                             id="mfa-code" type="text" inputMode="numeric" pattern="[0-9]{6}" // Improve mobile UX and add basic validation
                             placeholder="Enter 6-digit code" value={mfaVerificationCode}
                             onChange={(e) => setMfaVerificationCode(e.target.value)} required disabled={isVerifyingMfaCode} suppressHydrationWarning={true}
                           />
                       </div>
                       <div className="flex items-center justify-between mb-4">
                           <Button
                             className="w-full"
                             type="submit"
                             disabled={isVerifyingMfaCode || !appCheckInitialized} // Add App Check check
                             suppressHydrationWarning={true}
                           >
                             {isVerifyingMfaCode ? <Icons.loader className="mr-2 h-4 w-4 animate-spin" /> : <Icons.check className="mr-2 h-4 w-4" />}
                             Verify Code & Login
                           </Button>
                       </div>
                       {/* Option to request new code if needed */}
                        <div className="text-center text-sm">
                            <Button
                                type="button"
                                variant="link"
                                onClick={() => {
                                    // Reset state to allow re-selecting number and sending new code
                                    setMfaVerificationId(null);
                                    setSelectedMfaHint(null);
                                    setMfaVerificationCode('');
                                    setError(null); // Clear previous errors
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


            {/* Back to Login Link */}
            <div className="text-center mt-4">
                <Button type="button" variant="link" onClick={showLogin} className="text-sm" disabled={loading || isSendingMfaCode || isVerifyingMfaCode || !auth || !appCheckInitialized} suppressHydrationWarning={true}>
                  Cancel MFA / Back to Login
                </Button>
            </div>
          </>
        )}

         {/* reCAPTCHA Container */}
          {/* This div is used by the invisible reCAPTCHA. It must exist in the DOM when needed. */}
         <div ref={recaptchaContainerRef} id="recaptcha-container-mfa" className="my-4"></div>

      </div>
    </div>
  );
};

export default AuthPage;
