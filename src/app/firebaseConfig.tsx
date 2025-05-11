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
  console.log("Attempting to initialize Firebase...");
  // Basic check for essential config keys
   const requiredKeys = ['apiKey', 'authDomain', 'projectId'];
   const missingKeys = requiredKeys.filter(key => !(firebaseConfig as any)[key]);

  if (missingKeys.length > 0) {
      console.error(
          `Firebase configuration is incomplete. Missing or empty essential environment variables: ${missingKeys.map(k => `NEXT_PUBLIC_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`).join(', ')}. Please check your .env file or environment settings.`
      );
      appInitialized = false;
      authInitialized = false; // Ensure auth is not initialized if app fails
      appCheckInitialized = false;
  } else {
    // Prevent re-initialization on hot reloads in development
    if (!getApps().length) {
        console.log("Initializing new Firebase app instance.");
        app = initializeApp(firebaseConfig);
    } else {
        console.log("Using existing Firebase app instance.");
        app = getApps()[0];
    }
    appInitialized = true;
    console.log("Firebase core app initialized successfully.");

    // Initialize Firebase Auth
    if (app) {
        try {
            auth = getAuth(app);
            authInitialized = true;
            console.log("Firebase Auth initialized successfully.");
        } catch (e) {
            console.error("Firebase Auth initialization failed:", e);
            authInitialized = false;
        }
    }


    // Initialize App Check with ReCaptcha Enterprise
    const recaptchaEnterpriseSiteKey = process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
    const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;

    if (app && authInitialized && recaptchaEnterpriseSiteKey && recaptchaEnterpriseSiteKey.trim() !== '') { // Added trim check & authInitialized
        console.log("Attempting to initialize Firebase App Check with ReCaptcha Enterprise...");
        console.log(`Using ReCAPTCHA Enterprise Site Key: Provided`);

        // Set debug token if running locally and token is provided
       if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && debugToken) {
           console.log("Setting Firebase App Check debug token for local development:", debugToken);
           (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
       } else if (process.env.NODE_ENV !== 'production') {
           console.warn(
            "Local Dev Hint: Firebase App Check debug token (NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN) was not found or this is not a 'development' environment. " +
            "If you are developing locally and App Check is enforced, it will likely fail without this token OR if 'localhost' is not an authorized domain for your reCAPTCHA Enterprise key. " +
            "App Check will attempt to use reCAPTCHA Enterprise. See console for more App Check error details if initialization fails."
           );
       }

      try {
          const provider = new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey);
          console.log("ReCaptchaEnterpriseProvider instance created.");

          initializeAppCheck(app, {
            provider: provider,
            isTokenAutoRefreshEnabled: true
          });

          appCheckInitialized = true;
          console.log("Firebase App Check initialized successfully with ReCaptcha Enterprise provider.");
      } catch (appCheckError: any) {
            console.error("Firebase App Check initialization failed:", appCheckError.code, appCheckError.message);
            appCheckInitialized = false;

            if (appCheckError instanceof Error) {
                if ((appCheckError as any).code === 'appCheck/fetch-status-error') {
                     console.error(
                        "CRITICAL ACTION REQUIRED (appCheck/fetch-status-error - HTTP 403 Forbidden):\n" +
                        "This error means App Check token validation FAILED on Firebase servers. Your requests to Firebase are being BLOCKED by App Check.\n" +
                        "THIS IS A CONFIGURATION ISSUE IN YOUR FIREBASE/GOOGLE CLOUD CONSOLE. Code changes in this application CANNOT fix this.\n" +
                        "Please VERIFY IMMEDIATELY:\n" +
                        "1. **DOMAIN AUTHORIZATION (Google Cloud Console):** Is your application's domain (e.g., 'localhost', 'your-project-id.web.app', 'us-central1.hosted.app') *EXPLICITLY* listed as an authorized domain for your reCAPTCHA Enterprise key? Go to Google Cloud Console -> Security -> reCAPTCHA Enterprise -> YOUR KEY -> Settings -> Domains. THIS IS THE MOST COMMON CAUSE.\n" +
                        "2. **CORRECT SITE KEY:** Is `NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY` in your .env file *EXACTLY* the Site Key from your reCAPTCHA Enterprise console (for the *correct* Google Cloud project)?\n" +
                        "3. **reCAPTCHA Enterprise API ENABLED:** Is the 'reCAPTCHA Enterprise API' enabled in your Google Cloud project that's linked to this Firebase project?\n" +
                        "4. **APP CHECK CONFIG (Firebase Console):** Is App Check configured in Firebase Console (Project Settings -> App Check -> Your Web App) to use reCAPTCHA Enterprise with the *correct* site key? Is enforcement set appropriately? (Try 'Not enforced' for initial testing if stuck, then re-enable).\n" +
                        "5. **DEBUG TOKEN (for 'localhost'):** If testing on 'localhost' AND App Check is 'Enforced' in Firebase: ensure `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` is correctly set in your .env file and the token is valid/not expired. Also, ensure 'localhost' (and potentially `http://localhost:[port]`) is an authorized domain for your reCAPTCHA key in Google Cloud.\n" +
                        "6. **BILLING ACCOUNT (Google Cloud):** Is your Google Cloud Project linked to an active billing account? reCAPTCHA Enterprise is a paid service beyond the free tier and requires billing for full functionality and higher quotas.\n" +
                        "7. **Firewall/Network:** Less likely for a 403 from App Check servers, but ensure no firewalls are blocking communication to `firebaseappcheck.googleapis.com`.\n" +
                        "Official Troubleshooting: https://firebase.google.com/docs/app-check/web/debug-recaptcha-enterprise"
                    );
                } else if (appCheckError.message.includes('reCAPTCHA error') || (appCheckError as any).code === 'appCheck/recaptcha-error' || (appCheckError as any).code === 'appcheck/recaptcha-error') {
                    console.error(
                        "CLIENT-SIDE RECAPTCHA ERROR (appCheck/recaptcha-error):\n" +
                        "This error strongly suggests a client-side reCAPTCHA setup problem. Please verify the following in your Firebase/Google Cloud Console:\n" +
                        "1. **Domain Authorization (Google Cloud):** Is your application's domain (e.g., 'localhost' or 'your-deployed-url.web.app', 'us-central1.hosted.app') *EXPLICITLY* listed as an authorized domain in the **Google Cloud Console** for this specific reCAPTCHA Enterprise key?\n" +
                        "2. **Correct Site Key:** Is the `NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY` environment variable set correctly with the key from Google Cloud?\n" +
                        "3. **API Enabled (Google Cloud):** Is the 'reCAPTCHA Enterprise API' enabled in your Google Cloud project?\n" +
                        "4. **Firebase App Check Link:** Is App Check correctly configured and linked to this ReCaptcha Enterprise key in the Firebase Console (Project Settings -> App Check -> Your Web App)? \n" +
                        "5. **Network Issues:** Are there any network issues (firewalls, browser extensions like ad blockers) blocking connections to Google services (e.g., google.com, gstatic.com, googleapis.com)?\n" +
                        "6. **Billing Account (Google Cloud):** Ensure your Google Cloud project has a valid billing account linked, as reCAPTCHA Enterprise may require it for full functionality.\n"+
                        "Official Troubleshooting: https://firebase.google.com/docs/app-check/web/debug-recaptcha-enterprise"
                    );
                } else if (appCheckError.message.includes('fetch') || appCheckError.message.includes('NetworkError')) {
                    console.error("Hint: A network error occurred during App Check client-side setup. Check internet connection and ensure firewall/proxy settings allow access to Google services (e.g., googleapis.com, gstatic.com). This is different from the 403 'fetch-status-error' which is a server-side rejection.");
                } else if (appCheckError.message.includes('invalid-argument')) {
                     console.error("Hint: 'Invalid argument' during App Check setup often means the site key format is incorrect or there's a configuration mismatch between Firebase and Google Cloud.");
                }
                 else {
                     console.error(`Hint: An unexpected App Check error occurred on the client-side (${(appCheckError as any).code || 'unknown code'}): ${appCheckError.message}. Review Firebase project settings, App Check configuration (Firebase & Google Cloud), environment variables, and ensure the reCAPTCHA Enterprise API is enabled.`);
                }
            } else {
                 console.error("Hint: An unexpected non-error value was thrown during App Check initialization. Review configuration.", appCheckError);
            }
      }

    } else if (!app) {
        console.error("Firebase App Check initialization skipped: Firebase app instance is not available.");
        appCheckInitialized = false;
    } else if (!authInitialized) {
        console.error("Firebase App Check initialization skipped: Firebase Auth instance is not available.");
        appCheckInitialized = false;
    }
     else if (!recaptchaEnterpriseSiteKey || recaptchaEnterpriseSiteKey.trim() === '') {
        console.warn(
         "Firebase App Check initialization SKIPPED: " +
         "NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY environment variable is MISSING or EMPTY. " +
         "App Check protects your backend resources from abuse. " +
         "It's STRONGLY RECOMMENDED to configure it with a ReCaptcha Enterprise site key for production."
       );
       appCheckInitialized = false;
    }

  }
} catch (e) {
    console.error("CRITICAL Error during Firebase or App Check INITIALIZATION BLOCK:", e);
    appInitialized = false;
    authInitialized = false;
    appCheckInitialized = false;
}

console.log(`Initialization Status - Firebase Core: ${appInitialized}, Firebase Auth: ${authInitialized}, App Check: ${appCheckInitialized}`);


if (appInitialized && authInitialized && !appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) { // Added check for site key presence
    console.error(
        "\n**************************************************************************************************************************************************\n" +
        "CRITICAL CONFIGURATION ISSUE: Firebase App Check FAILED to initialize OR is misconfigured, despite Firebase Core and Auth initializing successfully AND a ReCAPTCHA site key being provided.\n" +
        "This will likely lead to request failures (like HTTP 403 Forbidden) for backend services (Authentication, Firestore, Cloud Functions, GenAI Flows, etc.) protected by App Check.\n\n" +
        "==> THIS IS ALMOST CERTAINLY A CONFIGURATION PROBLEM IN YOUR FIREBASE/GOOGLE CLOUD CONSOLE. <==\n" +
        "==> REVIEW THE DETAILED CONSOLE LOGS ABOVE FOR SPECIFIC ERROR CODES (e.g., 'appCheck/fetch-status-error', 'appCheck/recaptcha-error') AND HINTS. <==\n\n" +
        "COMMON CAUSES for 'appCheck/fetch-status-error' (HTTP 403 - Forbidden by App Check Server):\n" +
        "  1. **DOMAIN NOT AUTHORIZED in Google Cloud Console:** Your app's domain (e.g., 'localhost', 'your-project.web.app', 'us-central1.hosted.app') MUST be in the allowed list for your reCAPTCHA Enterprise key.\n" +
        "  2. **INCORRECT `NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY`** in your .env file.\n" +
        "  3. **'reCAPTCHA Enterprise API' NOT ENABLED** in your Google Cloud project.\n" +
        "  4. **Google Cloud Project NOT LINKED TO A BILLING ACCOUNT** (reCAPTCHA Enterprise requires this).\n" +
        "  5. **Incorrect App Check setup in Firebase Console** (provider, site key, or enforcement settings).\n" +
        "  6. For 'localhost' with ENFORCED App Check: Missing or EXPIRED `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` in .env, OR 'localhost' not authorized for the reCAPTCHA key.\n\n" +
        "COMMON CAUSES for 'appCheck/recaptcha-error' (Client-side reCAPTCHA problem):\n" +
        "  - Similar to above, often domain authorization or site key issues preventing the reCAPTCHA widget itself from working.\n" +
        "  - Network issues (firewall, ad-blockers) blocking reCAPTCHA scripts.\n\n" +
        "ACTION REQUIRED: Please meticulously check your Firebase and Google Cloud Console settings based on the logs.\n" +
        "Official Firebase App Check Troubleshooting Guide: https://firebase.google.com/docs/app-check/web/debug-recaptcha-enterprise\n" +
        "**************************************************************************************************************************************************\n"
    );
}


// Export appCheckInitialized status so components can check it
export { app, appInitialized, auth, authInitialized, appCheckInitialized };

    