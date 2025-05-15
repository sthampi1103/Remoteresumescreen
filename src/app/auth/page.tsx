
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
    setRecaptchaWidgetIdInternal(id);
  };


  useEffect(() => {
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
      setError(msg);
    } else if (authInitialized && !siteKeyProvided && !appCheckInitialized && !error) {
    } else if (error) {
    } else {
    }
  }, [appInitialized, authInitialized, appCheckInitialized, error, siteKeyProvided]);


   useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
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

     if (!appInitialized || !authInitialized || !auth || !recaptchaContainerRef.current) {
       if (recaptchaVerifier) {
         recaptchaVerifier.clear();
         setRecaptchaVerifier(null);
         setRecaptchaWidgetId(null);
         if (recaptchaContainerRef.current) {
            recaptchaContainerRef.current.innerHTML = '';
         }
       }
       return;
     }

     if (recaptchaVerifier) {
       return;
     }
    
     if (recaptchaContainerRef.current) {
        recaptchaContainerRef.current.innerHTML = '';
     }
     setRecaptchaWidgetId(null);

      let instanceForThisEffect: RecaptchaVerifier | null = null;

      try {
         instanceForThisEffect = new RecaptchaVerifier(auth,
           recaptchaContainerRef.current,
           {
             size: 'invisible',
             callback: (response: any) => {
             },
             'expired-callback': () => {
                setError("reCAPTCHA challenge expired. Please try the action again.");
                setIsSendingMfaCode(false);
                setLoadingMessage(null);
             }
           }
         );
          setRecaptchaVerifier(instanceForThisEffect);

         instanceForThisEffect.render().then((widgetId) => {
            if (widgetId !== undefined && widgetId !== null) {
                 setRecaptchaWidgetId(widgetId);
            }
         }).catch(renderError => {
            const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'your-deployed-domain.com';
            if (renderError.code === 'auth/network-request-failed') {
                let detailedMessage = `Failed to render reCAPTCHA for MFA (Error: auth/network-request-failed). This often means the browser could not load reCAPTCHA resources from Google (e.g., www.google.com/recaptcha, www.gstatic.com/recaptcha).`;
                detailedMessage += `\n\nTROUBLESHOOTING FOR DEPLOYED DOMAIN ('${currentHostname}'):`;
                detailedMessage += `\n1. **Domain Authorization in Google Cloud reCAPTCHA Console:** Ensure '${currentHostname}' (and its parent wildcard if applicable, e.g., 'us-central1.hosted.app' for 'xxxx.us-central1.hosted.app') is EXPLICITLY listed as an authorized domain for the reCAPTCHA key associated with your Firebase project.`;
                if (siteKeyProvided) {
                    detailedMessage += ` Since you are using a reCAPTCHA Enterprise key for App Check ('${process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY}'), verify this specific key's authorized domains in the Google Cloud Console.`;
                }
                detailedMessage += `\n2. **reCAPTCHA Enterprise API Enabled:** Confirm the 'reCAPTCHA Enterprise API' (or standard reCAPTCHA API if not using Enterprise for MFA) is enabled in your Google Cloud project.`;
                detailedMessage += `\n3. **Network/Firewall/CSP:** Check for any network firewalls, corporate proxies, or restrictive Content Security Policies (CSP) on your deployed environment that might be blocking requests to Google's reCAPTCHA services.`;
                detailedMessage += `\n4. **Billing Account:** Ensure your Google Cloud Project is linked to an active billing account, as reCAPTCHA Enterprise might require it.`;
                detailedMessage += `\n\nOriginal error: ${renderError.message}`;
                setError(detailedMessage);
                console.error("AuthPage: Detailed reCAPTCHA render failure for MFA:", detailedMessage);
            } else if (renderError.message && renderError.message.toLowerCase().includes('recaptcha')) {
                 setError(`Failed to render reCAPTCHA for MFA (Error: ${renderError.code || 'unknown'}). This is often due to configuration issues or network problems. Please check: 1. Your domain ('${currentHostname}') is authorized for reCAPTCHA in Google Cloud. 2. The reCAPTCHA API is enabled. 3. Network connectivity to Google services (e.g., www.google.com/recaptcha, www.gstatic.com/recaptcha). Ensure no firewall, VPN, or ad-blocker is interfering. Detailed error: ${renderError.message}`);
            } else {
                setError("Failed to render reCAPTCHA for MFA. Phone authentication may fail. Check console for Firebase hints about 'already rendered' or other setup issues.");
            }
         });

      } catch (creationError: any) {
          instanceForThisEffect = null;
          setRecaptchaVerifier(null);
          const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'your-deployed-domain.com';
          if (creationError.code === 'auth/network-request-failed') {
            let detailedMessage = `Failed to initialize reCAPTCHA verifier for MFA due to a network error (Code: auth/network-request-failed). This means the Firebase SDK could not establish a connection required for reCAPTCHA.`;
            detailedMessage += `\n\nTROUBLESHOOTING FOR DEPLOYED DOMAIN ('${currentHostname}'):`;
            detailedMessage += `\n1. **Internet Connectivity:** Ensure the client machine has stable internet.`;
            detailedMessage += `\n2. **Domain Authorization for reCAPTCHA Key:** Ensure '${currentHostname}' (and its parent wildcard if applicable) is EXPLICITLY authorized for the reCAPTCHA key in your Google Cloud Console.`;
            if (siteKeyProvided) {
                detailedMessage += ` If using an Enterprise key for App Check ('${process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY}'), verify *that* key's domain list.`;
            }
            detailedMessage += `\n3. **Firewall/Proxy/Ad-blockers:** Check if any of these are blocking requests to Google services (www.google.com/recaptcha, www.gstatic.com/recaptcha).`;
            detailedMessage += `\n4. **Firebase Project/Google Cloud Config:** Verify overall Firebase and Google Cloud project health and reCAPTCHA API enablement.`;
            detailedMessage += `\n\nOriginal error: ${creationError.message}`;
            setError(detailedMessage);
            console.error("AuthPage: Detailed reCAPTCHA verifier initialization failure:", detailedMessage);
          } else {
            setError("Failed to initialize reCAPTCHA verifier for MFA. Authentication involving phone may fail. Ensure only one reCAPTCHA container is present and it's correctly referenced.");
          }
      }

     return () => {
        if (instanceForThisEffect) {
            instanceForThisEffect.clear();
        }
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
   }, [appInitialized, authInitialized, auth, recaptchaContainerRef, recaptchaVerifier, recaptchaWidgetId, siteKeyProvided]);


  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    
    if (!authInitialized || !auth) {
      const msg = 'Firebase Authentication is not ready. Cannot proceed with login. Please wait or refresh. If the issue persists, check your Firebase setup and console logs from firebaseConfig.tsx.';
      setError(msg);
      return;
    }
     
     console.log("AuthPage: Pre-Login App Check Status - siteKeyProvided:", siteKeyProvided, "appCheckInitialized:", appCheckInitialized);
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
                  setError(null);
                  try {
                       const resolver = getMultiFactorResolver(auth, err);
                       if (resolver) {
                         setMfaResolver(resolver);
                         const phoneHints = resolver.hints.filter(
                           (hint): hint is PhoneMultiFactorInfo => hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID
                         );
                         setMfaHints(phoneHints);
                         setIsMFAPrompt(true);
                       } else {
                          setError("Multi-factor authentication setup seems incomplete. Please try again or contact support.");
                       }
                  } catch (resolverError: any) {
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
          return;
      }

      if (!selectedMfaHint || !mfaResolver) {
          const msg = "Could not initiate MFA verification. Select a phone number and try again. Selected hint or MFA resolver is missing.";
          setError(msg);
          return;
      }
      if (!recaptchaVerifier) {
           const msg = "reCAPTCHA verifier (for MFA) is not ready. Please wait and try again. If this persists, ensure the reCAPTCHA container is visible and there are no console errors related to its rendering (e.g., network blocks to www.google.com/recaptcha or www.gstatic.com/recaptcha). Check Firebase/GCP console for domain authorization & API settings for reCAPTCHA.";
           setError(msg);
           return;
      }
       
       if (siteKeyProvided && !appCheckInitialized) {
         const msg = "App Check is not ready. MFA code sending cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error' from 'firebaseConfig.tsx'.";
         setError(msg);
         return;
       }

      setError(null);
      setIsSendingMfaCode(true);
      setLoadingMessage('Sending verification code...');

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

      } catch (err: any) {
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
           // @ts-ignore
           if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined' && window.grecaptcha && recaptchaWidgetId !== null && typeof window.grecaptcha.reset === 'function') {
               try {
                   // @ts-ignore
                   window.grecaptcha.reset(recaptchaWidgetId);
               } catch (e) {
               }
           }
      }
  };


  const handleVerifyMfaCode = async () => {
      if (process.env.NODE_ENV !== 'production') {
        setError("MFA code verification is disabled in non-production environments.");
        return;
      }

      if (!mfaVerificationCode || !mfaResolver || !mfaVerificationId) {
          const msg = "Missing information to verify the code. Please request a new code and try again. Verification code, resolver, or verification ID is missing.";
          setError(msg);
          return;
      }
      
      if (siteKeyProvided && !appCheckInitialized) {
        const msg = "App Check is not ready. MFA code verification cannot proceed. Please wait a moment and try again. Verify Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key) and check console for 'appCheck/recaptcha-error' from 'firebaseConfig.tsx'.";
        setError(msg);
        return;
      }

      setError(null);
      setIsVerifyingMfaCode(true);
      setLoadingMessage('Verifying code...');

      try {
          const cred = PhoneMultiFactorGenerator.assertion(
              mfaVerificationId,
              mfaVerificationCode
          );
          const userCredential = await mfaResolver.resolveSignIn(cred);
          setLoadingMessage('Login successful!');
          router.push('/'); 

      } catch (err: any) {
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
                        // @ts-ignore
                        if (typeof window !== 'undefined' && window.grecaptcha && recaptchaWidgetId !== null && typeof window.grecaptcha.reset === 'function') {
                            try {
                                // @ts-ignore
                                window.grecaptcha.reset(recaptchaWidgetId);
                            } catch (e) {
                            }
                        }
                        recaptchaVerifier.clear();
                        setRecaptchaVerifier(null);
                        if (recaptchaContainerRef.current) recaptchaContainerRef.current.innerHTML = '';
                        setRecaptchaWidgetId(null);
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
      setEmail('');
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
    setIsSignUp(!isSignUp);
    setIsForgotPassword(false);
    resetAuthState();
  };

  const showForgotPassword = () => {
    setIsForgotPassword(true);
    setIsSignUp(false);
    resetAuthState();
  };

  const showLogin = () => {
    setIsForgotPassword(false);
    setIsSignUp(false);
    resetAuthState();
  };
  
  if (typeof window !== 'undefined') {
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
                                    setMfaVerificationId(null);
                                    setSelectedMfaHint(null);
                                    setMfaVerificationCode('');
                                    setError(null);
                                    setLoadingMessage(null);
                                    if (recaptchaVerifier && process.env.NODE_ENV === 'production') {
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

    