
'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useState, useRef, useCallback} from 'react';
import * as ExcelJS from 'exceljs';
import jsPDF from 'jspdf'; // Import jsPDF
import {Button} from '@/components/ui/button';
import JobDescriptionInput from '@/components/JobDescriptionInput';
import ResumeUpload from '@/components/ResumeUpload';
import ResultsDisplay from '@/components/ResultsDisplay';
import InterviewQnADisplay from '@/components/InterviewQuestionsDisplay'; // Import updated component
import FileConverter from '@/components/FileConverter'; // Import new component
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs'; // Import Tabs
import {Icons} from '@/components/icons';
import {useToast} from '@/hooks/use-toast';
import { Toaster } from "@/components/ui/toaster";
import { appInitialized, app, appCheckInitialized } from './firebaseConfig'; // Import appCheckInitialized
import { getAuth, signOut } from 'firebase/auth'; // Import signOut
import { rankResumes, RankResumesOutput } from '@/ai/flows/rank-resumes';
import { generateInterviewQnA, GenerateQnAOutput } from '@/ai/flows/generate-interview-questions'; // Import updated flow
import { Separator } from '@/components/ui/separator'; // Import Separator

// Note: If you encounter a runtime error like "Cannot read properties of null (reading 'type')"
// originating from a browser extension (e.g., chrome-extension://.../inpage.js),
// it's likely caused by the extension interfering with the page, not a bug in this application.
// Try disabling the problematic browser extension (like crypto wallets or ad blockers) and reloading the page.

export default function Home() {
  const [jobDescription, setJobDescription] = useState('');
  const [resumesText, setResumesText] = useState('');
  const [results, setResults] = useState<RankResumesOutput>([]); // Use correct type
  const [interviewQnA, setInterviewQnA] = useState<GenerateQnAOutput['qna']>([]); // State for Q&A pairs
  const [isStartActive, setIsStartActive] = useState(false);
  const [isResetActive, setIsResetActive] = useState(false);
  const [isResultsDisplayed, setIsResultsDisplayed] = useState(false);
  const [showInterviewQnA, setShowInterviewQnA] = useState(false); // State to control Q&A tab visibility
  const [clearJDTrigger, setClearJDTrigger] = useState(false);
  const [clearResumesTrigger, setClearResumesTrigger] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingQnA, setIsGeneratingQnA] = useState(false); // Loading state for Q&A
  const [qnaGenerationError, setQnAGenerationError] = useState<string | null>(null); // Error state for Q&A
  const [isJDValid, setIsJDValid] = useState(false);
  const [areResumesValid, setAreResumesValid] = useState(false);
  const [activeTab, setActiveTab] = useState("results"); // State for active tab

  const router = useRouter();
  const {toast} = useToast();


  // Get Firebase Auth instance
  let auth;
  if (appInitialized) {
    auth = getAuth(app);
  }

  // Redirect to auth page if Firebase isn't initialized or user isn't logged in
  useEffect(() => {
    if (!appInitialized) {
       console.error("Firebase not initialized, cannot check auth state.");
       // Optionally redirect or show an error message
       // router.push('/auth'); // Consider uncommenting if non-auth access should be blocked
      return;
    }
     if (!auth) {
       console.error("Auth instance not available.");
       // router.push('/auth'); // Consider uncommenting
       return;
     }
    
    if (!appCheckInitialized) {
      toast({
        title: "App Check Security Alert",
        description: "App Check failed to initialize. Key functionalities may be impaired or disabled. Please check the browser console for detailed error messages (e.g., 'appCheck/recaptcha-error' or debug token issues) and verify your Firebase/Google Cloud App Check configuration.",
        variant: "destructive",
        duration: Infinity, // Make it sticky until dismissed or page reloads
      });
      // Disable buttons or show a more prominent page-level warning if needed
      // For now, buttons will be disabled via their own `disabled` prop checking appCheckInitialized
    }

    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
         router.push('/auth');
      }
    });
    return () => unsubscribe();
  }, [router, appInitialized, auth, appCheckInitialized, toast]); // Add dependencies


  // Check if inputs are valid whenever jobDescription or resumesText changes
  useEffect(() => {
    const shouldStartBeActive = isJDValid && areResumesValid && !isResultsDisplayed && appCheckInitialized; // Add appCheckInitialized
    setIsStartActive(shouldStartBeActive);

    const shouldResetBeActive =
      jobDescription.trim() !== '' ||
      resumesText.trim() !== '' ||
      results.length > 0 ||
      interviewQnA.length > 0 || // Consider Q&A for reset
      isResultsDisplayed || showInterviewQnA; // Consider if Q&A are shown
    setIsResetActive(shouldResetBeActive);
  }, [jobDescription, resumesText, results, interviewQnA, isJDValid, areResumesValid, isResultsDisplayed, showInterviewQnA, appCheckInitialized]); // Add appCheckInitialized

  const handleJDChange = (jd: string, isValid: boolean) => {
    setJobDescription(jd);
    setIsJDValid(isValid);
  };

  const handleResumesChange = (resumes: string, isValid: boolean) => {
    setResumesText(resumes);
    setAreResumesValid(isValid);
  };

  const handleStart = async () => {
    if (!appCheckInitialized) {
      toast({
        title: "App Check Error",
        description: "Cannot start analysis: App Check is not initialized. Please resolve configuration issues (see console).",
        variant: "destructive",
      });
      return;
    }
    if (!isJDValid || !areResumesValid) {
      toast({
        title: "Input Incomplete",
        description: "Please provide both a job description and at least one resume.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    setError(null);
    setResults([]); // Clear previous results
    setIsResultsDisplayed(true); // Indicate that results should be displayed/fetched
    setActiveTab("results"); // Ensure results tab is active
    setIsStartActive(false); // Deactivate Start button after clicking
    // ResultsDisplay component logic is now within this component's useEffect
  };

   const handleGenerateQnA = async () => { // Renamed handler
      if (!appCheckInitialized) {
        toast({
          title: "App Check Error",
          description: "Cannot generate Q&A: App Check is not initialized. Please resolve configuration issues (see console).",
          variant: "destructive",
        });
        return;
      }
      if (!isJDValid) {
          toast({
              title: "Job Description Missing",
              description: "Please provide a job description to generate Q&A.",
              variant: "destructive",
          });
          return;
      }
      setIsGeneratingQnA(true); // Use new loading state
      setQnAGenerationError(null); // Use new error state
      setInterviewQnA([]); // Clear previous Q&A
      setShowInterviewQnA(true); // Indicate Q&A tab should be visible
      setActiveTab("questions"); // Switch to questions tab (assuming tab value remains 'questions')

      try {
          const output: GenerateQnAOutput = await generateInterviewQnA({ jobDescription }); // Call updated flow
          setInterviewQnA(output.qna || []); // Set Q&A pairs
          if (!output.qna || output.qna.length === 0) {
            setQnAGenerationError("No Q&A were generated. The job description might be too short or unclear.");
          }
      } catch (err: any) {
          console.error("Error generating interview Q&A:", err);
          setQnAGenerationError(err.message || "An error occurred while generating Q&A.");
          setInterviewQnA([]); // Clear Q&A on error
      } finally {
          setIsGeneratingQnA(false); // Update loading state
      }
   };

  const handleReset = () => {
    setJobDescription('');
    setResumesText('');
    setResults([]);
    setInterviewQnA([]); // Reset Q&A
    setIsStartActive(false); // Will be recalculated by useEffect
    setIsResetActive(false); // Will be recalculated by useEffect
    setIsResultsDisplayed(false);
    setShowInterviewQnA(false); // Hide Q&A tab
    setLoading(false);
    setError(null);
    setIsGeneratingQnA(false); // Reset QnA loading state
    setQnAGenerationError(null); // Reset QnA error state
    setIsJDValid(false);
    setAreResumesValid(false);
    setClearJDTrigger(true); // Trigger clear in child components
    setClearResumesTrigger(true); // Trigger clear in child components
    setActiveTab("results"); // Reset to default tab
  };


  const handleSignOut = async () => {
     if (!auth) {
       console.error("Auth instance not available for sign out.");
       toast({ title: "Error", description: "Could not sign out.", variant: "destructive" });
       return;
     }
    try {
      await signOut(auth);
      // No need to clear logo as it's fixed now
      router.push('/auth');
    } catch (error) {
      console.error("Sign out error:", error);
       toast({ title: "Sign Out Error", description: "Failed to sign out.", variant: "destructive" });
    }
  };

  const handleClearComplete = useCallback((type: 'jd' | 'resumes') => {
    if (type === 'jd') {
      setClearJDTrigger(false);
    } else if (type === 'resumes') {
      setClearResumesTrigger(false);
    }
  }, []);


  const handleDownloadExcel = async () => {
    if (results.length === 0) {
        toast({
            title: "No Results",
            description: "There are no resume ranking results to download.",
            variant: "destructive",
        });
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Resume Ranking');

    worksheet.columns = [
      {header: 'Name', key: 'name', width: 20},
      {header: 'Summary', key: 'summary', width: 40},
      {header: 'Score', key: 'score', width: 10},
      {header: 'Rationale', key: 'rationale', width: 40},
      {
        header: 'Essential Skills Match',
        key: 'essentialSkillsMatch',
        width: 20,
      },
      {header: 'Relevant Experience', key: 'relevantExperience', width: 20},
      {
        header: 'Required Qualifications',
        key: 'requiredQualifications',
        width: 20,
      },
      {header: 'Keyword Presence', key: 'keywordPresence', width: 20},
      {header: 'Recommendation', key: 'recommendation', width: 20},
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern:'solid',
      fgColor:{argb:'FFDDDDDD'}
    };
     worksheet.getRow(1).border = {
        bottom: { style: 'thin' }
     };

    results.forEach((result, index) => {
      const row = worksheet.addRow({
        name: result.name || 'N/A',
        summary: result.summary,
        score: result.score,
        rationale: result.rationale,
        essentialSkillsMatch: result.breakdown?.essentialSkillsMatch ?? 'N/A',
        relevantExperience: result.breakdown?.relevantExperience ?? 'N/A',
        requiredQualifications: result.breakdown?.requiredQualifications ?? 'N/A',
        keywordPresence: result.breakdown?.keywordPresence ?? 'N/A',
        recommendation: result.recommendation,
      });
       if ((index + 1) % 2 === 0) {
         row.fill = {
           type: 'pattern',
           pattern:'solid',
           fgColor:{argb:'FFF5F5F5'}
         };
       }
    });

    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell!({ includeEmpty: true }, cell => {
            let cellLength = cell.value ? cell.value.toString().length : 0;
            if (cellLength > maxLength) {
                maxLength = cellLength;
            }
        });
        column.width = maxLength < 10 ? 10 : maxLength > 50 ? 50 : maxLength + 2;
    });
     worksheet.getColumn('summary').width = 40;
     worksheet.getColumn('rationale').width = 40;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'resume_ranking.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadQnAPDF = () => { // Renamed function
     if (interviewQnA.length === 0) {
         toast({
             title: "No Q&A",
             description: "There are no interview Q&A to download.",
             variant: "destructive",
         });
         return;
     }

     const doc = new jsPDF();
     doc.setFontSize(16);
     doc.text("Interview Questions & Answers", 10, 10);

     let yPos = 25; // Start position for Q&A
     const pageHeight = doc.internal.pageSize.height;
     const margin = 10;
     const questionAnswerSpacing = 3;
     const pairSpacing = 8;

     interviewQnA.forEach((item, index) => {
         doc.setFontSize(12);
         doc.setFont(undefined, 'bold'); // Make question bold
         const questionLines = doc.splitTextToSize(`Q${index + 1}: ${item.question}`, doc.internal.pageSize.width - margin * 2);
         const questionHeight = questionLines.length * (doc.getLineHeight() / doc.internal.scaleFactor);

         if (yPos + questionHeight > pageHeight - margin) {
             doc.addPage();
             yPos = margin; // Reset yPos for new page
         }

         doc.text(questionLines, margin, yPos);
         yPos += questionHeight + questionAnswerSpacing;

         doc.setFont(undefined, 'normal'); // Reset font style for answer
         doc.setFontSize(10); // Slightly smaller font for answer
         doc.setTextColor(100); // Muted color for answer text
         const answerLines = doc.splitTextToSize(`A: ${item.answer}`, doc.internal.pageSize.width - margin * 2 - 5); // Slightly indent answer
         const answerHeight = answerLines.length * (doc.getLineHeight() / doc.internal.scaleFactor);

          if (yPos + answerHeight > pageHeight - margin) {
              doc.addPage();
              yPos = margin; // Reset yPos for new page
          }

         doc.text(answerLines, margin + 5, yPos); // Indent answer text
         yPos += answerHeight + pairSpacing; // Add space after the answer
         doc.setTextColor(0); // Reset text color
     });

     doc.save('interview_qna.pdf'); // Save as Q&A PDF
  };


  // Effect to fetch data when isResultsDisplayed becomes true
  useEffect(() => {
    const fetchData = async () => {
      if (!isResultsDisplayed || !jobDescription || !resumesText) {
        return;
      }
      if (!appCheckInitialized) { // Double check App Check before expensive AI call
        setError("App Check not initialized. Cannot perform AI operations.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setResults([]);

      try {
        const resumesArray = resumesText.split(/\n\s*\n\s*\n/).map(r => r.trim()).filter(text => text !== '');
        if (resumesArray.length === 0) {
             setError("No valid resumes found in the input. Please ensure resumes are separated correctly or uploaded.");
             setLoading(false);
             return;
         }

        const apiResults = await rankResumes({ jobDescription, resumes: resumesArray });
        setResults(apiResults);
        setError(null);
      } catch (err: any) {
        console.error("Error ranking resumes:", err);
        if (err.message && (err.message.includes('app-check') || err.message.includes('appCheck/recaptcha-error'))) {
           setError("Failed to analyze resumes due to an App Check security error. Please check console for details and verify your Firebase/Google Cloud setup.");
        } else {
           setError(err.message || "An error occurred while analyzing resumes.");
        }
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResultsDisplayed, appCheckInitialized]); // Added appCheckInitialized, jobDescription, resumesText were already implicitly part of this via isResultsDisplayed guard


  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Banner */}
       <div className="relative bg-primary text-primary-foreground p-4 flex flex-col items-center shadow-md">
         {/* Logout Button Top Right */}
         <div className="absolute top-4 right-4">
           <Button
             variant="secondary"
             onClick={handleSignOut}
             aria-label="Logout"
             suppressHydrationWarning={true}
             disabled={!auth} // Disable if auth isn't ready
           >
             <Icons.logout className="mr-2 h-4 w-4" /> Logout
           </Button>
         </div>

        {/* Fixed SVG Logo */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          className="h-20 w-auto rounded-md shadow-md mb-2 object-contain" // Keep styling similar
        >
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              {/* Adjusted gradient stops to match the image more closely */}
              <stop offset="0%" style={{ stopColor: 'hsl(25, 80%, 70%)', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: 'hsl(25, 70%, 50%)', stopOpacity: 1 }} />
            </linearGradient>
             <linearGradient id="grad2" x1="100%" y1="0%" x2="0%" y2="100%">
               {/* Adjusted gradient stops to match the image more closely */}
               <stop offset="0%" style={{ stopColor: 'hsl(25, 80%, 70%)', stopOpacity: 0.8 }} />
               <stop offset="100%" style={{ stopColor: 'hsl(25, 70%, 50%)', stopOpacity: 0.8 }} />
             </linearGradient>
          </defs>
          {/* Background circle with a very light peach color */}
           <circle cx="256" cy="256" r="256" fill="hsl(30, 50%, 95%)" />
           {/* Path approximating the curved shape */}
           <path
            fill="url(#grad1)"
            d="M 50.2,256 C 50.2,142.2 142.2,50.2 256,50.2 C 369.8,50.2 461.8,142.2 461.8,256 C 461.8,369.8 369.8,461.8 256,461.8 C 142.2,461.8 50.2,369.8 50.2,256 Z M 100,256 C 100,167.9 167.9,100 256,100 C 344.1,100 412,167.9 412,256 C 412,280 405,302.5 393.5,322 C 357.1,300.9 309.5,288 256,288 C 202.5,288 154.9,300.9 118.5,322 C 107,302.5 100,280 100,256 Z"
            transform="rotate(-20 256 256)"
          />
           <path
            fill="url(#grad2)"
            d="M 118.5,190 C 154.9,211.1 202.5,224 256,224 C 309.5,224 357.1,211.1 393.5,190 C 405,209.5 412,232 412,256 C 412,344.1 344.1,412 256,412 C 167.9,412 100,344.1 100,256 C 100,232 107,209.5 118.5,190 Z"
            transform="rotate(-20 256 256)"
            opacity="0.8"
            />

        </svg>
        <h1 className="text-2xl font-bold mt-2">Resume Screening App</h1>
      </div>

      <div className="container mx-auto p-4 flex-grow">
         {/* File Converter Section */}
         <div className="bg-card text-card-foreground shadow-md rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">File Converter (PDF/DOCX to TXT)</h2>
            <FileConverter />
         </div>
         <Separator className="my-6" />


        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Job Description Input Section */}
          <div className="bg-card text-card-foreground shadow-md rounded-lg p-6 flex flex-col">
            <h2 className="text-xl font-semibold mb-4">Job Description Input</h2>
            <div className="flex-grow">
              <JobDescriptionInput
                onJDChange={handleJDChange}
                clear={clearJDTrigger}
                onClear={() => handleClearComplete('jd')}
              />
            </div>
             {/* Generate Q&A Button */}
             <Button
                onClick={handleGenerateQnA} // Use new handler
                disabled={!isJDValid || isGeneratingQnA || !appCheckInitialized} // Use new loading state, add appCheckInitialized
                aria-label="Generate interview Q&A"
                className="mt-4"
                suppressHydrationWarning={true}
              >
                 {isGeneratingQnA ? ( // Use new loading state
                  <>
                    <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                   <Icons.wand className="mr-2 h-4 w-4" />
                   Generate Q&A {/* Updated button text */}
                 </>
                )}
              </Button>
          </div>

          {/* Resume Upload Section */}
          <div className="bg-card text-card-foreground shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Resume Upload</h2>
            <ResumeUpload
              onResumesChange={handleResumesChange}
              clear={clearResumesTrigger}
              onClear={() => handleClearComplete('resumes')}
            />
          </div>
        </div>

        {/* Start and Reset Buttons */}
        <div className="flex justify-center mt-6 gap-4">
          <Button
            onClick={handleStart}
            disabled={!isStartActive || loading || !appCheckInitialized} // Also disable while loading results or if AppCheck failed
            aria-label="Start analysis"
            suppressHydrationWarning={true}
          >
             {loading ? (
              <>
                <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
               <>
                <Icons.play className="mr-2 h-4 w-4" /> {/* Added play icon */}
                Start
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!isResetActive}
            aria-label="Reset inputs and results"
            suppressHydrationWarning={true}
          >
             <Icons.refresh className="mr-2 h-4 w-4" /> {/* Added refresh icon */}
            Reset
          </Button>
        </div>

        {/* Results and Questions Display Section */}
        {(isResultsDisplayed || showInterviewQnA) && (
          <div className="bg-card text-card-foreground shadow-md rounded-lg p-6 mt-6">
             <Tabs value={activeTab} onValueChange={setActiveTab}>
               <TabsList className="grid w-full grid-cols-2">
                 <TabsTrigger value="results" disabled={!isResultsDisplayed}>Resume Ranking</TabsTrigger>
                 {/* Keep value as "questions" for simplicity, but text is "Interview Q&A" */}
                 <TabsTrigger value="questions" disabled={!showInterviewQnA}>Interview Q&amp;A</TabsTrigger>
               </TabsList>
               {/* Results Tab */}
               <TabsContent value="results">
                 <h2 className="text-xl font-semibold mb-4 sr-only">Results</h2> {/* Title handled by TabTrigger */}
                  {loading ? (
                    <Alert>
                      <Icons.loader className="h-4 w-4 animate-spin" />
                      <AlertTitle>Analyzing Resumes</AlertTitle>
                      <AlertDescription>
                        Please wait while the resumes are being analyzed...
                      </AlertDescription>
                    </Alert>
                  ) : error ? (
                       <Alert variant="destructive">
                         <Icons.alertCircle className="h-4 w-4" />
                         <AlertTitle>Error Ranking Resumes</AlertTitle>
                         <AlertDescription>{error}</AlertDescription>
                       </Alert>
                  ) : results.length > 0 ? (
                    <>
                      <ResultsDisplay results={results} />
                       <div className="flex justify-end mt-4">
                          <Button
                            variant="secondary"
                            onClick={handleDownloadExcel}
                            aria-label="Download results as Excel file"
                            suppressHydrationWarning={true}
                          >
                            <Icons.file className="mr-2 h-4 w-4" />
                            Download XLS
                          </Button>
                        </div>
                    </>
                  ) : isResultsDisplayed ? (
                    // Show if triggered but no results (and not loading/error)
                    <p className="text-center text-muted-foreground mt-4">No ranking results to display.</p>
                  ): null /* Don't show anything if not triggered */}
               </TabsContent>

               {/* Interview Q&A Tab */}
                <TabsContent value="questions">
                  <h2 className="text-xl font-semibold mb-4 sr-only">Interview Q&amp;A</h2> {/* Title handled by TabTrigger */}
                   {isGeneratingQnA ? ( // Use new loading state
                     <Alert>
                       <Icons.loader className="h-4 w-4 animate-spin" />
                       <AlertTitle>Generating Q&amp;A</AlertTitle> {/* Updated title */}
                       <AlertDescription>
                         Please wait while interview Q&amp;A are being generated... {/* Updated description */}
                       </AlertDescription>
                     </Alert>
                   ) : qnaGenerationError ? ( // Use new error state
                        <Alert variant="destructive">
                          <Icons.alertCircle className="h-4 w-4" />
                          <AlertTitle>Error Generating Q&amp;A</AlertTitle> {/* Updated title */}
                          <AlertDescription>{qnaGenerationError}</AlertDescription>
                        </Alert>
                   ) : interviewQnA.length > 0 ? ( // Check new state
                     <>
                       <InterviewQnADisplay qna={interviewQnA} /> {/* Pass Q&A pairs */}
                       <div className="flex justify-end mt-4">
                         <Button
                           variant="secondary"
                           onClick={handleDownloadQnAPDF} // Use updated download handler
                           aria-label="Download Q&A as PDF file"
                           suppressHydrationWarning={true}
                         >
                           <Icons.fileText className="mr-2 h-4 w-4" />
                           Download PDF
                         </Button>
                       </div>
                     </>
                   ) : showInterviewQnA ? ( // Check if tab should be shown
                     // Show if triggered but no Q&A (and not loading/error)
                    <p className="text-center text-muted-foreground mt-4">No interview Q&amp;A to display.</p>
                   ) : null /* Don't show anything if not triggered */}
                </TabsContent>
             </Tabs>
          </div>
        )}
      </div>
      {/* Toaster for displaying notifications */}
       <Toaster />
    </div>
  );
}
