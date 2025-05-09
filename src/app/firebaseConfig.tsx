// Import the functions you need from the SDKs you need
import { initializeApp, FirebaseApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check"; // Updated import
// import { getAnalytics } from "firebase/analytics"; // Analytics can be added if needed

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

    // Initialize App Check with ReCaptcha Enterprise
    const recaptchaEnterpriseSiteKey = process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
    const debugToken = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;

    if (app && recaptchaEnterpriseSiteKey && recaptchaEnterpriseSiteKey.trim() !== '') { // Added trim check
        console.log("Attempting to initialize Firebase App Check with ReCaptcha Enterprise...");
        console.log(`Using ReCAPTCHA Enterprise Site Key: Provided`);

        // Set debug token if running locally and token is provided
        // IMPORTANT: Ensure the debug token is correctly generated and not expired.
        // You can generate one in the Firebase Console -> App Check -> Your App -> Manage debug tokens.
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
          // Ensure this provider instance is created correctly.
          // Errors here might indicate issues with the key itself or network access to Google services.
          const provider = new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey);
          console.log("ReCaptchaEnterpriseProvider instance created.");

          // The core App Check initialization. Errors here are often related to
          // configuration mismatches (Firebase vs. Google Cloud) or network issues.
          initializeAppCheck(app, {
            provider: provider,
            // Optional: Set to true for automated token refresh. Default is true.
            isTokenAutoRefreshEnabled: true
          });

          appCheckInitialized = true;
          console.log("Firebase App Check initialized successfully with ReCaptcha Enterprise provider.");
      } catch (appCheckError: any) {
            console.error("Firebase App Check initialization failed:", appCheckError.code, appCheckError.message);
            appCheckInitialized = false; // Ensure state reflects failure

             // Provide more specific guidance based on common errors
            if (appCheckError instanceof Error) { // Check if it's an Error object
                if ((appCheckError as any).code === 'appCheck/fetch-status-error') {
                     console.error(
                        "CRITICAL Hint (appCheck/fetch-status-error - Often HTTP 403 Forbidden): This error means App Check token validation FAILED on Firebase servers.\n" +
                        "Your requests to Firebase are being BLOCKED by App Check. Please verify IMMEDIATELY:\n" +
                        "1. **Domain Authorization in GOOGLE CLOUD CONSOLE:** Is your application's domain (e.g., 'localhost', 'your-project-id.web.app') *EXPLICITLY* listed as an authorized domain for your reCAPTCHA Enterprise key? Go to Google Cloud Console -> Security -> reCAPTCHA Enterprise -> YOUR KEY -> Settings -> Domains. THIS IS THE MOST COMMON CAUSE.\n" +
                        "2. **Correct Site Key:** Is `NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY` in your .env file *EXACTLY* the Site Key from your reCAPTCHA Enterprise console (for the *correct* Google Cloud project)?\n" +
                        "3. **reCAPTCHA Enterprise API Enabled:** Is the 'reCAPTCHA Enterprise API' enabled in your Google Cloud project that's linked to this Firebase project?\n" +
                        "4. **App Check Configuration in FIREBASE CONSOLE:** Is App Check configured in Firebase Console (Project Settings -> App Check -> Your Web App) to use reCAPTCHA Enterprise with the *correct* site key? Is enforcement set appropriately? (Try 'Not enforced' for initial testing if stuck, then re-enable).\n" +
                        "5. **Debug Token (for 'localhost'):** If testing on 'localhost' AND App Check is 'Enforced' in Firebase: ensure `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` is correctly set in your .env file and the token is valid/not expired. Also, ensure 'localhost' (and potentially `http://localhost:[port]`) is an authorized domain for your reCAPTCHA key in Google Cloud.\n" +
                        "6. **Billing Account:** Is your Google Cloud Project linked to an active billing account? reCAPTCHA Enterprise is a paid service beyond the free tier and requires billing for full functionality and higher quotas.\n" +
                        "7. **Firewall/Network:** Less likely for a 403 from App Check servers, but ensure no firewalls are blocking communication to `firebaseappcheck.googleapis.com`."
                    );
                } else if (appCheckError.message.includes('reCAPTCHA error') || (appCheckError as any).code === 'appCheck/recaptcha-error' || (appCheckError as any).code === 'appcheck/recaptcha-error') {
                    console.error(
                        "Hint (appCheck/recaptcha-error): This error strongly suggests a client-side reCAPTCHA setup problem. Please verify the following:\n" +
                        "1. **Domain Authorization (Google Cloud):** Is your application's domain (e.g., 'localhost' or 'your-deployed-url.web.app') *explicitly* listed as an authorized domain in the **Google Cloud Console** for this specific reCAPTCHA Enterprise key?\n" +
                        "2. **Correct Site Key:** Is the `NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY` environment variable set correctly with the key from Google Cloud?\n" +
                        "3. **API Enabled (Google Cloud):** Is the 'reCAPTCHA Enterprise API' enabled in your Google Cloud project?\n" +
                        "4. **Firebase App Check Link:** Is App Check correctly configured and linked to this ReCaptcha Enterprise key in the Firebase Console (Project Settings -> App Check)? \n" +
                        "5. **Network Issues:** Are there any network issues (firewalls, browser extensions like ad blockers) blocking connections to Google services (e.g., google.com, gstatic.com, googleapis.com)?\n" +
                        "6. **Billing Account (Google Cloud):** Ensure your Google Cloud project has a valid billing account linked, as reCAPTCHA Enterprise may require it for full functionality."
                    );
                } else if (appCheckError.message.includes('fetch') || appCheckError.message.includes('NetworkError')) { // More generic network error during setup
                    console.error("Hint: A network error occurred during App Check client-side setup. Check internet connection and ensure firewall/proxy settings allow access to Google services (e.g., googleapis.com, gstatic.com). This is different from the 403 'fetch-status-error' which is a server-side rejection.");
                } else if (appCheckError.message.includes('invalid-argument')) {
                     console.error("Hint: 'Invalid argument' during App Check setup often means the site key format is incorrect or there's a configuration mismatch between Firebase and Google Cloud.");
                }
                 else {
                     // General App Check error
                     console.error(`Hint: An unexpected App Check error occurred on the client-side (${(appCheckError as any).code || 'unknown code'}): ${appCheckError.message}. Review Firebase project settings, App Check configuration (Firebase & Google Cloud), environment variables, and ensure the reCAPTCHA Enterprise API is enabled.`);
                }
            } else {
                 // Non-Error object thrown
                 console.error("Hint: An unexpected non-error value was thrown during App Check initialization. Review configuration.", appCheckError);
            }
      }

    } else if (!app) {
        console.error("Firebase App Check initialization skipped: Firebase app instance is not available.");
        appCheckInitialized = false;
    } else if (!recaptchaEnterpriseSiteKey || recaptchaEnterpriseSiteKey.trim() === '') { // Updated condition
        console.warn(
         "Firebase App Check initialization skipped: " +
         "NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY environment variable is missing or empty. " + // Added "or empty"
         "App Check protects your backend resources from abuse. " +
         "It's strongly recommended to configure it with a ReCaptcha Enterprise site key for production."
       );
       appCheckInitialized = false;
    }

  }
} catch (e) {
    console.error("Critical error during Firebase or App Check initialization:", e);
    appInitialized = false;
    appCheckInitialized = false;
}

console.log(`Initialization Status - Firebase Core: ${appInitialized}, App Check: ${appCheckInitialized}`);

if (appInitialized && !appCheckInitialized) {
    console.error(
        "\n**************************************************************************************************************************************************\n" +
        "CRITICAL: Firebase App Check FAILED to initialize OR is misconfigured, leading to request failures (like HTTP 403).\n" +
        "This means backend services (Authentication, Firestore, Cloud Functions, GenAI Flows, etc.) protected by App Check WILL LIKELY FAIL.\n\n" +
        "==> Please REVIEW THE DETAILED CONSOLE LOGS ABOVE for specific error codes (e.g., 'appCheck/fetch-status-error', 'appCheck/recaptcha-error') and HINTS. <==\n\n" +
        "COMMON CAUSES for 'appCheck/fetch-status-error' (HTTP 403 - Forbidden by App Check Server):\n" +
        "  1. DOMAIN NOT AUTHORIZED in Google Cloud Console: Your app's domain (e.g., 'localhost', 'your-project.web.app') MUST be in the allowed list for your reCAPTCHA Enterprise key.\n" +
        "  2. INCORRECT `NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY` in your .env file.\n" +
        "  3. 'reCAPTCHA Enterprise API' NOT ENABLED in your Google Cloud project.\n" +
        "  4. Google Cloud Project NOT LINKED TO A BILLING ACCOUNT (reCAPTCHA Enterprise requires this).\n" +
        "  5. Incorrect App Check setup in Firebase Console (provider, site key, or enforcement settings).\n" +
        "  6. For 'localhost' with ENFORCED App Check: Missing or EXPIRED `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` in .env, OR 'localhost' not authorized for the reCAPTCHA key.\n\n" +
        "COMMON CAUSES for 'appCheck/recaptcha-error' (Client-side reCAPTCHA problem):\n" +
        "  - Similar to above, often domain authorization or site key issues preventing the reCAPTCHA widget itself from working.\n" +
        "  - Network issues (firewall, ad-blockers) blocking reCAPTCHA scripts.\n" +
        "**************************************************************************************************************************************************\n"
    );
}


// Export appCheckInitialized status so components can check it
export { app, appInitialized, appCheckInitialized };

