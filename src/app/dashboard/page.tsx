'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth'; // Only signOut is needed from firebase/auth
import { useEffect } from 'react';
import { auth, authInitialized } from '../firebaseConfig'; // Import auth and authInitialized

const Dashboard = () => {
  const router = useRouter();

  useEffect(() => {
    if (!authInitialized) {
      // Auth is not yet initialized, wait or show loading
      // Depending on desired behavior, you might redirect or show a spinner
      console.log("Dashboard: Firebase Auth not initialized yet.");
      // If auth becomes available later, this effect will re-run.
      // If it never becomes available, the user will be stuck or redirected by the onAuthStateChanged logic.
      return;
    }

    if (!auth) {
      // This case should ideally be caught by authInitialized being false,
      // but as a safeguard:
      console.error("Dashboard: Firebase Auth instance is null after initialization.");
      router.push('/auth');
      return;
    }

    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
        router.push('/auth');
      }
    });

    // Cleanup function
    return () => unsubscribe();
  }, [router, authInitialized]); // Add authInitialized to dependency array

  const handleSignOut = async () => {
    if (!authInitialized || !auth) {
      console.error("Sign out error: Firebase Auth not ready.");
      // Optionally, show a toast to the user
      return;
    }
    try {
      await signOut(auth);
      router.push('/auth');
    } catch (error) {
      console.error("Sign out error:", error);
      // Optionally, show a toast to the user
    }
  };

  // Conditional rendering while auth is initializing
  if (!authInitialized) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>Loading authentication state...</p>
        {/* You can replace this with a spinner component */}
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-background">
      <div className="bg-card text-card-foreground p-8 rounded-lg shadow-lg w-full max-w-md border">
        <h2 className="text-2xl font-bold mb-6 text-center">Dashboard</h2>
        <p className="mb-6 text-center text-muted-foreground">Welcome! You are successfully logged in.</p>
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleSignOut}
          disabled={!authInitialized || !auth} // Disable if auth not ready
          suppressHydrationWarning={true}
        >
          <Icons.logout className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;

    