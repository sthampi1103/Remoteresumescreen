
// Import the functions you need from the SDKs you need
import { initializeApp, FirebaseApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check"; // Updated import
import { getAuth, Auth } from "firebase/auth"; // Import Auth and getAuth

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
let app: FirebaseApp | undefined;
let appInitialized = false;
let appCheckInitialized = false;
let auth: Auth | undefined;
let authInitialized = false;

try {
  // Basic check for essential config keys
   const requiredKeys = ['apiKey', 'authDomain', 'projectId'];
   const missingKeys = requiredKeys.filter(key => !(firebaseConfig as any)[key]);

  if (missingKeys.length > 0) {
      console.error(
          `FirebaseConfig: CRITICAL - Firebase configuration is incomplete. Missing or empty essential environment variables: ${missingKeys.map(k => `NEXT_PUBLIC_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`).join(', ')}. Please check your .env file or environment settings.`
      );
      appInitialized = false;
      authInitialized = false; 
      appCheckInitialized = false;
  } else {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApps()[0];
    }
    appInitialized = true;
    // console.log("FirebaseConfig: Firebase App initialized successfully.");

    // Initialize Firebase Auth
    if (app) {
        try {
            auth = getAuth(app);
            authInitialized = true;
            // console.log("FirebaseConfig: Firebase Auth initialized successfully.");
        } catch (e: any) {
            console.error("FirebaseConfig: Firebase Auth initialization FAILED:", e.code, e.message, e);
            authInitialized = false;
        }
    } else {
        console.error("FirebaseConfig: Firebase Auth initialization SKIPPED: Firebase app instance is not available.");
        authInitialized = false;
    }

    // Initialize App Check with ReCaptcha Enterprise
    const recaptchaEnterpriseSiteKey = process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
    // console.log("FirebaseConfig: NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY:", recaptchaEnterpriseSiteKey ? "Exists" : "MISSING or EMPTY");
    const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;
    // console.log("FirebaseConfig: NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN:", debugToken ? "Exists" : "MISSING or EMPTY");


    if (app && authInitialized && recaptchaEnterpriseSiteKey && recaptchaEnterpriseSiteKey.trim() !== '') {
        
       if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && debugToken) {
           // (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
           // The above line is commented out to prevent the Firebase SDK from logging the debug token.
           // WARNING: This will likely cause App Check to FAIL in local development if enforcement is on,
           // as the SDK will not automatically use the debug token.
           // The SDK logs the token message when it's set this way and used.
           // console.log("FirebaseConfig: Attempted to set FIREBASE_APPCHECK_DEBUG_TOKEN (but it's now commented out to suppress SDK logging). Local App Check may fail.");
       } else if (process.env.NODE_ENV !== 'production' && !debugToken) {
           console.warn(
            "FirebaseConfig: Local Dev Hint - NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN not found. If App Check is enforced and 'localhost' isn't fully whitelisted for your reCAPTCHA key in Google Cloud, App Check may fail. Consider generating and setting a debug token."
           );
       }

      try {
          // console.log("FirebaseConfig: Initializing App Check with ReCaptchaEnterpriseProvider...");
          const provider = new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey);
          // console.log("FirebaseConfig: ReCaptchaEnterpriseProvider created.");

          initializeAppCheck(app, {
            provider: provider,
            isTokenAutoRefreshEnabled: true
          });
          // console.log("FirebaseConfig: Firebase App Check initialized successfully.");
          appCheckInitialized = true;
      } catch (appCheckError: any) {
            console.error("FirebaseConfig: Firebase App Check initialization FAILED:", appCheckError.code, appCheckError.message, appCheckError);
            appCheckInitialized = false;

            if (appCheckError instanceof Error) {
                if ((appCheckError as any).code === 'appCheck/fetch-status-error') {
                     console.error(
                        "\n**************************************************************************************************************************************************\n" +
                        "FirebaseConfig: CRITICAL ACTION REQUIRED (appCheck/fetch-status-error - HTTP 403 Forbidden):\n" +
                        "App Check token validation FAILED on Firebase servers. Requests to Firebase are being BLOCKED.\n" +
                        "THIS IS A CONFIGURATION ISSUE IN YOUR FIREBASE/GOOGLE CLOUD CONSOLE. Code changes in this application CANNOT fix this.\n" +
                        "VERIFY IMMEDIATELY:\n" +
                        "1. DOMAIN AUTHORIZATION (Google Cloud Console): Is your app's domain (e.g., 'localhost', 'your-project-id.web.app', 'region.hosted.app', 'YOUR_PROJECT_ID.us-central1.hosted.app', 'YOUR_PROJECT_ID.europe-west4.hosted.app') *EXPLICITLY* listed as an authorized domain for your reCAPTCHA Enterprise key? Go to Google Cloud Console -> Security -> reCAPTCHA Enterprise -> YOUR KEY -> Settings -> Domains. THIS IS THE MOST COMMON CAUSE. Try adding 'http://localhost' and 'https://localhost' if using localhost.\n" +
                        "2. CORRECT SITE KEY: Is `NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY` in your .env file *EXACTLY* the Site Key from your reCAPTCHA Enterprise console?\n" +
                        "3. reCAPTCHA Enterprise API ENABLED: Is the 'reCAPTCHA Enterprise API' enabled in your Google Cloud project?\n" +
                        "4. APP CHECK CONFIG (Firebase Console): Is App Check configured in Firebase Console to use reCAPTCHA Enterprise with the *correct* site key? Is enforcement set appropriately?\n" +
                        "5. DEBUG TOKEN (for 'localhost'): If testing on 'localhost' AND App Check is 'Enforced': ensure `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` is correctly set and valid.\n" +
                        "6. BILLING ACCOUNT (Google Cloud): Is your Google Cloud Project linked to an active billing account?\n" +
                        "TROUBLESHOOTING: https://firebase.google.com/docs/app-check/web/debug-recaptcha-enterprise" +
                        "\n**************************************************************************************************************************************************"
                    );
                } else if ((appCheckError as any).code?.includes('recaptcha-error')) { // More general check for recaptcha errors
                    console.error(
                        "\n**************************************************************************************************************************************************\n" +
                        "FirebaseConfig: CLIENT-SIDE RECAPTCHA ERROR (appCheck/recaptcha-error):\n" +
                        "This suggests a client-side reCAPTCHA setup problem. VERIFY:\n" +
                        "1. DOMAIN AUTHORIZATION (Google Cloud): Is your app's domain (e.g., 'localhost', 'your-deployed-url.web.app', 'region.hosted.app', 'YOUR_PROJECT_ID.us-central1.hosted.app', 'YOUR_PROJECT_ID.europe-west4.hosted.app') *EXPLICITLY* listed as an authorized domain in Google Cloud Console for this reCAPTCHA Enterprise key? Try adding 'http://localhost' and 'https://localhost' if using localhost.\n" +
                        "2. CORRECT SITE KEY: Is `NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY` correct?\n" +
                        "3. API ENABLED (Google Cloud): Is 'reCAPTCHA Enterprise API' enabled?\n" +
                        "4. FIREBASE APP CHECK LINK: Is App Check correctly linked to this ReCaptcha Enterprise key in Firebase Console?\n" +
                        "5. NETWORK/ADBLOCKERS: Any network issues or browser extensions (ad blockers) blocking Google services (google.com, gstatic.com, googleapis.com)?\n" +
                        "TROUBLESHOOTING: https://firebase.google.com/docs/app-check/web/debug-recaptcha-enterprise" +
                        "\n**************************************************************************************************************************************************"
                    );
                } else if (appCheckError.message.includes('fetch') || appCheckError.message.includes('NetworkError')) {
                    console.error("FirebaseConfig: Hint - A network error occurred during App Check client-side setup. Check internet connection and ensure firewall/proxy settings allow access to Google services (e.g., googleapis.com, gstatic.com).");
                } else if (appCheckError.message.includes('invalid-argument')) {
                     console.error("FirebaseConfig: Hint - 'Invalid argument' during App Check setup often means the site key format is incorrect or there's a configuration mismatch.");
                }
                 else {
                     console.error(`FirebaseConfig: Hint - An unexpected App Check error occurred on the client-side (${(appCheckError as any).code || 'unknown code'}): ${appCheckError.message}.`);
                }
            } else {
                 console.error("FirebaseConfig: Hint - An unexpected non-error value was thrown during App Check initialization.", appCheckError);
            }
      }

    } else if (!app) {
        console.error("FirebaseConfig: Firebase App Check initialization SKIPPED: Firebase app instance is not available.");
        appCheckInitialized = false;
    } else if (!authInitialized) { // Check authInitialized directly
        console.warn("FirebaseConfig: Firebase App Check initialization SKIPPED: Firebase Auth instance did not initialize successfully. App Check relies on Auth being ready.");
        appCheckInitialized = false;
    } else if (!recaptchaEnterpriseSiteKey || recaptchaEnterpriseSiteKey.trim() === '') {
        console.warn(
         "FirebaseConfig: Firebase App Check initialization SKIPPED: " +
         "NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY environment variable is MISSING or EMPTY. " +
         "App Check protects backend resources. It's STRONGLY RECOMMENDED to configure it."
       );
       appCheckInitialized = false;
    }
  }
} catch (e: any) {
    console.error("FirebaseConfig: CRITICAL Error during Firebase or App Check INITIALIZATION BLOCK:", e.code, e.message, e);
    appInitialized = false;
    authInitialized = false;
    appCheckInitialized = false;
}

if (appInitialized && authInitialized && !appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
    console.error(
        "\n**************************************************************************************************************************************************\n" +
        "FirebaseConfig: CRITICAL CONFIGURATION ISSUE DETECTED:\n" +
        "Firebase Core and Auth initialized, AND a ReCAPTCHA site key IS PROVIDED, BUT App Check FAILED to initialize OR is misconfigured.\n" +
        "This will likely lead to request failures (HTTP 403 Forbidden) for backend services (Authentication, Firestore, GenAI Flows, etc.) if App Check is enforced.\n\n" +
        "==> THIS IS ALMOST CERTAINLY A CONFIGURATION PROBLEM IN YOUR FIREBASE/GOOGLE CLOUD CONSOLE. <==\n" +
        "==> REVIEW THE DETAILED CONSOLE LOGS ABOVE FOR SPECIFIC ERROR CODES (e.g., 'appCheck/fetch-status-error', 'appCheck/recaptcha-error') AND HINTS. <==\n\n" +
        "COMMON CAUSES & SOLUTIONS:\n" +
        "  1. **DOMAIN NOT AUTHORIZED (Google Cloud Console):** Your app's domain (e.g., 'localhost', 'your-project.web.app', 'region.hosted.app', 'YOUR_PROJECT_ID.us-central1.hosted.app', 'YOUR_PROJECT_ID.europe-west4.hosted.app') MUST be in the allowed list for your reCAPTCHA Enterprise key. Try adding 'http://localhost' AND 'https://localhost' if developing locally.\n" +
        "  2. **INCORRECT `NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY`** in your .env file.\n" +
        "  3. **'reCAPTCHA Enterprise API' NOT ENABLED** in your Google Cloud project.\n" +
        "  4. **Google Cloud Project NOT LINKED TO A BILLING ACCOUNT** (reCAPTCHA Enterprise often requires this).\n" +
        "  5. **Incorrect App Check setup in Firebase Console** (provider, site key, or enforcement settings).\n" +
        "  6. For 'localhost' with ENFORCED App Check: Missing or EXPIRED `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` in .env, OR 'localhost' not authorized for the reCAPTCHA key.\n\n" +
        "ACTION REQUIRED: Meticulously check your Firebase and Google Cloud Console settings. Refer to: https://firebase.google.com/docs/app-check/web/debug-recaptcha-enterprise\n" +
        "**************************************************************************************************************************************************\n"
    );
}

export { app, appInitialized, auth, authInitialized, appCheckInitialized };

    