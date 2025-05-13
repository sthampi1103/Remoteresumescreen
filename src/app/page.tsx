
'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useState, useRef, useCallback} from 'react';
import * as ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import {Button} from '@/components/ui/button';
import JobDescriptionInput from '@/components/JobDescriptionInput';
import ResumeUpload from '@/components/ResumeUpload';
import ResultsDisplay from '@/components/ResultsDisplay';
import InterviewQnADisplay from '@/components/InterviewQuestionsDisplay';
import FileConverter from '@/components/FileConverter';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Icons} from '@/components/icons';
import {useToast} from '@/hooks/use-toast';
import { Toaster } from "@/components/ui/toaster";
import { appInitialized, app, auth, appCheckInitialized, authInitialized } from '@/app/firebaseConfig'; 
import { signOut } from 'firebase/auth'; 
import { rankResumes, RankResumesOutput } from '@/ai/flows/rank-resumes';
import { generateInterviewQnA, GenerateQnAOutput } from '@/ai/flows/generate-interview-questions'; 
import { Separator } from '@/components/ui/separator';

export default function Home() {
  const [jobDescription, setJobDescription] = useState('');
  const [resumesText, setResumesText] = useState('');
  const [results, setResults] = useState<RankResumesOutput>([]);
  const [interviewQnA, setInterviewQnA] = useState<GenerateQnAOutput['qna']>([]);
  const [isStartActive, setIsStartActive] = useState(false);
  const [isResetActive, setIsResetActive] = useState(false);
  const [isResultsDisplayed, setIsResultsDisplayed] = useState(false);
  const [showInterviewQnA, setShowInterviewQnA] = useState(false);
  const [clearJDTrigger, setClearJDTrigger] = useState(false);
  const [clearResumesTrigger, setClearResumesTrigger] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingQnA, setIsGeneratingQnA] = useState(false);
  const [qnaGenerationError, setQnAGenerationError] = useState<string | null>(null);
  const [isJDValid, setIsJDValid] = useState(false);
  const [areResumesValid, setAreResumesValid] = useState(false);
  const [activeTab, setActiveTab] = useState("results");

  const router = useRouter();
  const {toast} = useToast();

  useEffect(() => {
    if (!appInitialized) {
       console.error("HomePage: Firebase core components are not yet initialized.");
       toast({
         title: "Initialization Error",
         description: "Core components are not ready. Please refresh or check console.",
         variant: "destructive",
         duration: Infinity,
       });
      return;
    }
    if (!authInitialized && appInitialized) {
       console.error("HomePage: Firebase Auth is not initialized.");
       toast({
         title: "Authentication Error",
         description: "Authentication system is not ready. You might be redirected. Check console.",
         variant: "destructive",
         duration: Infinity,
       });
    }
    if (!auth) { 
       console.error("HomePage: Auth instance not available from firebaseConfig. Redirecting to /auth.");
       router.push('/auth');
       return;
     }

    const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
    if (authInitialized && siteKeyProvided && !appCheckInitialized) {
      toast({
        title: "App Check Security Alert",
        description: "App Check failed to initialize. Key functionalities (like AI analysis and Q&A generation) will be disabled or will not work correctly. Please check the browser console for detailed error messages (e.g., 'appCheck/recaptcha-error' or debug token issues) and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).",
        variant: "destructive",
        duration: Infinity,
      });
       console.error("HomePage: App Check Security Alert - App Check failed to initialize despite site key being present.");
    } else if (authInitialized && !siteKeyProvided && !appCheckInitialized) {
       console.warn("HomePage: App Check Security Notice - App Check is not configured as NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY is missing. AI features might be vulnerable if App Check is not enforced server-side for Genkit flows.");
    }


    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
         console.log("HomePage: No authenticated user found, redirecting to /auth.");
         router.push('/auth');
      } else {
         console.log("HomePage: User is authenticated:", user.uid);
      }
    });
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, appInitialized, authInitialized, auth, appCheckInitialized, toast]);


  const siteKeyProvided = !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const isSystemReadyForOperations = authInitialized && auth && (!siteKeyProvided || appCheckInitialized);

  useEffect(() => {
    const shouldStartBeActive = isJDValid && areResumesValid && !isResultsDisplayed && isSystemReadyForOperations;
    setIsStartActive(shouldStartBeActive);

    const shouldResetBeActive =
      jobDescription.trim() !== '' ||
      resumesText.trim() !== '' ||
      results.length > 0 ||
      interviewQnA.length > 0 ||
      isResultsDisplayed || showInterviewQnA;
    setIsResetActive(shouldResetBeActive);
  }, [jobDescription, resumesText, results, interviewQnA, isJDValid, areResumesValid, isResultsDisplayed, showInterviewQnA, isSystemReadyForOperations]);

  const handleJDChange = (jd: string, isValid: boolean) => {
    setJobDescription(jd);
    setIsJDValid(isValid);
  };

  const handleResumesChange = (resumes: string, isValid: boolean) => {
    setResumesText(resumes);
    setAreResumesValid(isValid);
  };

  const handleStart = async () => {
    if (!authInitialized || !auth) {
        toast({ title: "Authentication Error", description: "Firebase Auth is not ready. Cannot start analysis.", variant: "destructive" });
        console.error("handleStart: Auth not ready.");
        return;
    }
    if (siteKeyProvided && !appCheckInitialized) {
      toast({
        title: "App Check Error",
        description: "Cannot start analysis: App Check is not initialized. Please resolve configuration issues (see console and verify domain authorization, API enablement, and site key).",
        variant: "destructive",
      });
      console.error("handleStart: App Check not ready.");
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
    setResults([]);
    setIsResultsDisplayed(true); 
    setActiveTab("results"); 
  
  };

   const handleGenerateQnA = async () => {
      if (!authInitialized || !auth) {
          toast({ title: "Authentication Error", description: "Firebase Auth is not ready for Q&A generation.", variant: "destructive" });
          console.error("handleGenerateQnA: Auth not ready.");
          return;
      }
      if (siteKeyProvided && !appCheckInitialized) {
        toast({
          title: "App Check Error",
          description: "Cannot generate Q&A: App Check is not initialized. Please resolve configuration issues (see console and verify domain authorization, API enablement, and site key).",
          variant: "destructive",
        });
        console.error("handleGenerateQnA: App Check not ready.");
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
      setIsGeneratingQnA(true);
      setQnAGenerationError(null);
      setInterviewQnA([]);
      setShowInterviewQnA(true); 
      setActiveTab("questions"); 

      try {
          console.log("HomePage: Calling generateInterviewQnA AI flow...");
          const output: GenerateQnAOutput = await generateInterviewQnA({ jobDescription });
          setInterviewQnA(output.qna || []);
          if (!output.qna || output.qna.length === 0) {
            setQnAGenerationError("No Q&A were generated. The job description might be too short, unclear, or the AI could not process it at this time.");
            toast({ title: "Q&A Generation", description: "No Q&A were generated.", variant: "default" });
          } else {
            toast({ title: "Q&A Generated", description: `Successfully generated ${output.qna.length} Q&A pairs.`, variant: "default" });
          }
      } catch (err: any) {
          console.error("HomePage: Error generating interview Q&A:", err.code, err.message, err);
          let userMessage = "An error occurred while generating Q&A.";
          if (err.message) {
              if (err.message.includes('app-check') || err.message.includes('appCheck/recaptcha-error') || err.message.includes('fetch-status-error')) {
                userMessage = "Failed to generate Q&A due to an App Check security error. Please check console for details and verify your Firebase/Google Cloud setup (domain authorization, API enabled, site key).";
              } else if (err.code === 'functions/unavailable' || err.code === 'unavailable' || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('request failed')) {
                userMessage = "Failed to generate Q&A due to a network issue or the AI service being temporarily unavailable. Check your internet connection and ensure that your network/firewall/VPN/ad-blocker is not blocking requests to Google services (e.g., google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com, www.google.com/recaptcha, www.gstatic.com/recaptcha). Try again later.";
              } else {
                userMessage = `Error generating Q&A: ${err.message}`;
              }
          }
          setQnAGenerationError(userMessage);
          toast({ title: "Q&A Generation Error", description: userMessage, variant: "destructive" });
          setInterviewQnA([]);
      } finally {
          setIsGeneratingQnA(false);
      }
   };

  const handleReset = () => {
    setJobDescription('');
    setResumesText('');
    setResults([]);
    setInterviewQnA([]);
    setIsResetActive(false); 
    setIsResultsDisplayed(false);
    setShowInterviewQnA(false);
    setLoading(false);
    setError(null);
    setIsGeneratingQnA(false);
    setQnAGenerationError(null);
    setIsJDValid(false);
    setAreResumesValid(false);
    setClearJDTrigger(prev => !prev); 
    setClearResumesTrigger(prev => !prev); 
    setActiveTab("results");
    toast({ title: "Inputs Cleared", description: "All inputs and results have been reset.", variant: "default" });
  };

  const handleSignOut = async () => {
     if (!authInitialized || !auth) {
       console.error("HomePage: Auth instance not available for sign out.");
       toast({ title: "Sign Out Error", description: "Could not sign out, Auth not ready.", variant: "destructive" });
       return;
     }
    try {
      console.log("HomePage: Signing out user...");
      await signOut(auth);
      toast({ title: "Signed Out", description: "You have been successfully signed out.", variant: "default" });
      router.push('/auth'); 
    } catch (error: any) {
      console.error("HomePage: Sign out error:", error.code, error.message, error);
       toast({ title: "Sign Out Error", description: `Failed to sign out: ${error.message}`, variant: "destructive" });
    }
  };

  const handleClearComplete = useCallback((type: 'jd' | 'resumes') => {
    if (type === 'jd') {
    } else if (type === 'resumes') {
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
        if (column && column.eachCell) { 
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                let cellLength = cell.value ? cell.value.toString().length : 0;
                if (cellLength > maxLength) {
                    maxLength = cellLength;
                }
            });
            column.width = maxLength < 10 ? 10 : maxLength > 50 ? 50 : maxLength + 2;
        }
    });
     if(worksheet.getColumn('summary')) worksheet.getColumn('summary').width = 40;
     if(worksheet.getColumn('rationale')) worksheet.getColumn('rationale').width = 40;

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
    toast({ title: "Download Started", description: "Resume ranking results are being downloaded as Excel.", variant: "default" });
  };

  const handleDownloadQnAPDF = () => {
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

     let yPos = 25;
     const pageHeight = doc.internal.pageSize.height;
     const margin = 10;
     const questionAnswerSpacing = 3;
     const pairSpacing = 8;

     interviewQnA.forEach((item, index) => {
         doc.setFontSize(12);
         doc.setFont(undefined, 'bold');
         const questionLines = doc.splitTextToSize(`Q${index + 1}: ${item.question}`, doc.internal.pageSize.width - margin * 2);
         const questionHeight = questionLines.length * (doc.getLineHeight() / doc.internal.scaleFactor);

         if (yPos + questionHeight > pageHeight - margin) {
             doc.addPage();
             yPos = margin;
         }

         doc.text(questionLines, margin, yPos);
         yPos += questionHeight + questionAnswerSpacing;

         doc.setFont(undefined, 'normal');
         doc.setFontSize(10);
         doc.setTextColor(100); 
         const answerLines = doc.splitTextToSize(`A: ${item.answer}`, doc.internal.pageSize.width - margin * 2 - 5); 
         const answerHeight = answerLines.length * (doc.getLineHeight() / doc.internal.scaleFactor);

          if (yPos + answerHeight > pageHeight - margin) {
              doc.addPage();
              yPos = margin;
          }

         doc.text(answerLines, margin + 5, yPos);
         yPos += answerHeight + pairSpacing;
         doc.setTextColor(0); 
     });

     doc.save('interview_qna.pdf');
     toast({ title: "Download Started", description: "Interview Q&A is being downloaded as PDF.", variant: "default" });
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!isResultsDisplayed || !jobDescription || !resumesText || !isSystemReadyForOperations) {
        if (isResultsDisplayed && !isSystemReadyForOperations) {
            setError("Cannot perform AI operations: System not ready (Auth or App Check might have issues).");
            setLoading(false);
            toast({ title: "System Not Ready", description: "AI analysis cannot proceed. Check console for auth/App Check errors.", variant: "destructive" });
        }
        return;
      }
      
      console.log("HomePage: useEffect for fetchData triggered, calling rankResumes AI flow...");
      setLoading(true);
      setError(null);
      setResults([]); 

      try {
        const resumesArray = resumesText.split(/\n\s*\n\s*\n/).map(r => r.trim()).filter(text => text !== '');
        if (resumesArray.length === 0) {
             setError("No valid resumes found in the input. Please ensure resumes are separated correctly or uploaded.");
             setLoading(false);
             toast({ title: "Input Error", description: "No valid resumes found.", variant: "destructive" });
             return;
         }

        const apiResults = await rankResumes({ jobDescription, resumes: resumesArray });
        setResults(apiResults);
        setError(null);
        toast({ title: "Analysis Complete", description: `Successfully analyzed ${apiResults.length} resume(s).`, variant: "default" });
      } catch (err: any) {
        console.error("HomePage: Error ranking resumes:", err.code, err.message, err);
        let userMessage = "An error occurred while analyzing resumes.";
         if (err.message) {
              if (err.message.includes('app-check') || err.message.includes('appCheck/recaptcha-error') || err.message.includes('fetch-status-error')) {
                userMessage = "Failed to analyze resumes due to an App Check security error. Please check console for details and verify your Firebase/Google Cloud setup (domain authorization, API enabled, site key).";
              } else if (err.code === 'functions/unavailable' || err.code === 'unavailable' || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('request failed')) {
                userMessage = "Failed to analyze resumes due to a network issue or the AI service being temporarily unavailable. Check your internet connection and ensure that your network/firewall/VPN/ad-blocker is not blocking requests to Google services (e.g., google.com, gstatic.com, googleapis.com, firebaseappcheck.googleapis.com, www.google.com/recaptcha, www.gstatic.com/recaptcha). Try again later.";
              } else {
                userMessage = `Error analyzing resumes: ${err.message}`;
              }
          }
        setError(userMessage);
        toast({ title: "Analysis Error", description: userMessage, variant: "destructive" });
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    if (isResultsDisplayed) { 
        fetchData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResultsDisplayed, jobDescription, resumesText, isSystemReadyForOperations]); 

  return (
    <div className="flex flex-col min-h-screen bg-background">
       <header className="relative bg-primary text-primary-foreground p-4 flex flex-col items-center shadow-md print:hidden">
         <div className="absolute top-4 right-4">
           <Button
             variant="secondary"
             onClick={handleSignOut}
             aria-label="Logout"
             suppressHydrationWarning={true}
             disabled={!authInitialized || !auth}
           >
             <Icons.logout className="mr-2 h-4 w-4" /> Logout
           </Button>
         </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          className="h-16 w-auto sm:h-20 rounded-md shadow-md mb-2 object-contain"
          data-ai-hint="logo company"
          aria-label="ResumeRanker App Logo"
        >
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'hsl(25, 80%, 70%)', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: 'hsl(25, 70%, 50%)', stopOpacity: 1 }} />
            </linearGradient>
             <linearGradient id="grad2" x1="100%" y1="0%" x2="0%" y2="100%">
               <stop offset="0%" style={{ stopColor: 'hsl(25, 80%, 70%)', stopOpacity: 0.8 }} />
               <stop offset="100%" style={{ stopColor: 'hsl(25, 70%, 50%)', stopOpacity: 0.8 }} />
             </linearGradient>
          </defs>
           <circle cx="256" cy="256" r="256" fill="hsl(30, 50%, 95%)" />
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
        <h1 className="text-xl sm:text-2xl font-bold mt-2">ResumeRanker</h1>
      </header>

      <main className="container mx-auto p-4 flex-grow">
         <section className="bg-card text-card-foreground shadow-md rounded-lg p-4 sm:p-6 mb-6 print:hidden" aria-labelledby="file-converter-heading">
            <h2 id="file-converter-heading" className="text-lg sm:text-xl font-semibold mb-4">File Converter (PDF/DOCX to TXT)</h2>
            <FileConverter />
         </section>
         <Separator className="my-6 print:hidden" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-1">
          <section className="bg-card text-card-foreground shadow-md rounded-lg p-4 sm:p-6 flex flex-col" aria-labelledby="jd-input-heading">
            <h2 id="jd-input-heading" className="text-lg sm:text-xl font-semibold mb-4">Job Description Input</h2>
            <div className="flex-grow">
              <JobDescriptionInput
                onJDChange={handleJDChange}
                clear={clearJDTrigger}
                onClear={() => handleClearComplete('jd')}
              />
            </div>
             <Button
                onClick={handleGenerateQnA}
                disabled={!isJDValid || isGeneratingQnA || !isSystemReadyForOperations || loading} 
                aria-label="Generate interview Q&A based on job description"
                className="mt-4 print:hidden"
                suppressHydrationWarning={true}
              >
                 {isGeneratingQnA ? (
                  <>
                    <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                    Generating Q&A...
                  </>
                ) : (
                  <>
                   <Icons.wand className="mr-2 h-4 w-4" />
                   Generate Q&A
                 </>
                )}
              </Button>
          </section>

          <section className="bg-card text-card-foreground shadow-md rounded-lg p-4 sm:p-6 print:hidden" aria-labelledby="resume-upload-heading">
            <h2 id="resume-upload-heading" className="text-lg sm:text-xl font-semibold mb-4">Resume Upload</h2>
            <ResumeUpload
              onResumesChange={handleResumesChange}
              clear={clearResumesTrigger}
              onClear={() => handleClearComplete('resumes')}
            />
          </section>
        </div>

        <div className="flex justify-center mt-6 gap-4 print:hidden">
          <Button
            onClick={handleStart}
            disabled={!isStartActive || loading || !isSystemReadyForOperations}
            aria-label="Start resume analysis"
            suppressHydrationWarning={true}
            size="lg"
          >
             {loading ? (
              <>
                <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
               <>
                <Icons.play className="mr-2 h-4 w-4" />
                Start Analysis
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!isResetActive && !loading && !isGeneratingQnA} 
            aria-label="Reset all inputs and results"
            suppressHydrationWarning={true}
             size="lg"
          >
             <Icons.refresh className="mr-2 h-4 w-4" />
            Reset All
          </Button>
        </div>

        {(isResultsDisplayed || showInterviewQnA) && (
          <section className="bg-card text-card-foreground shadow-md rounded-lg p-4 sm:p-6 mt-6" aria-labelledby="analysis-results-heading">
             <Tabs value={activeTab} onValueChange={setActiveTab} className="print:hidden">
               <TabsList className="grid w-full grid-cols-2">
                 <TabsTrigger value="results" disabled={!isResultsDisplayed && !loading && !error}>Resume Ranking</TabsTrigger>
                 <TabsTrigger value="questions" disabled={!showInterviewQnA && !isGeneratingQnA && !qnaGenerationError}>Interview Q&amp;A</TabsTrigger>
               </TabsList>
               <TabsContent value="results">
                 <h2 id="analysis-results-heading" className="text-xl font-semibold my-4 sr-only">Resume Ranking Results</h2>
                  {loading && isResultsDisplayed ? ( 
                    <Alert>
                      <Icons.loader className="h-4 w-4 animate-spin" />
                      <AlertTitle>Analyzing Resumes</AlertTitle>
                      <AlertDescription>
                        Please wait while the resumes are being analyzed...
                      </AlertDescription>
                    </Alert>
                  ) : error && isResultsDisplayed ? ( 
                       <Alert variant="destructive">
                         <Icons.alertCircle className="h-4 w-4" />
                         <AlertTitle>Error Ranking Resumes</AlertTitle>
                         <AlertDescription>{error}</AlertDescription>
                       </Alert>
                  ) : results.length > 0 && isResultsDisplayed ? (
                    <>
                      <ResultsDisplay results={results} />
                       <div className="flex justify-end mt-4 print:hidden">
                          <Button
                            variant="secondary"
                            onClick={handleDownloadExcel}
                            aria-label="Download results as Excel file"
                            suppressHydrationWarning={true}
                            disabled={!isSystemReadyForOperations}
                          >
                            <Icons.file className="mr-2 h-4 w-4" />
                            Download XLS
                          </Button>
                        </div>
                    </>
                  ) : isResultsDisplayed && !loading ? ( 
                    <p className="text-center text-muted-foreground mt-4">No ranking results to display. The AI might not have found matches or there was an issue processing.</p>
                  ): null}
               </TabsContent>

                <TabsContent value="questions">
                  <h2 className="text-xl font-semibold my-4 sr-only">Interview Q&amp;A</h2>
                   {isGeneratingQnA ? (
                     <Alert>
                       <Icons.loader className="h-4 w-4 animate-spin" />
                       <AlertTitle>Generating Q&amp;A</AlertTitle>
                       <AlertDescription>
                         Please wait while interview Q&amp;A are being generated...
                       </AlertDescription>
                     </Alert>
                   ) : qnaGenerationError ? (
                        <Alert variant="destructive">
                          <Icons.alertCircle className="h-4 w-4" />
                          <AlertTitle>Error Generating Q&amp;A</AlertTitle>
                          <AlertDescription>{qnaGenerationError}</AlertDescription>
                        </Alert>
                   ) : interviewQnA.length > 0 && showInterviewQnA ? (
                     <>
                       <InterviewQnADisplay qna={interviewQnA} />
                       <div className="flex justify-end mt-4 print:hidden">
                         <Button
                           variant="secondary"
                           onClick={handleDownloadQnAPDF}
                           aria-label="Download Q&A as PDF file"
                           suppressHydrationWarning={true}
                           disabled={!isSystemReadyForOperations}
                         >
                           <Icons.fileText className="mr-2 h-4 w-4" />
                           Download PDF
                         </Button>
                       </div>
                     </>
                   ) : showInterviewQnA && !isGeneratingQnA ? ( 
                    <p className="text-center text-muted-foreground mt-4">No interview Q&amp;A to display. The AI might not have generated questions based on the job description.</p>
                   ) : null}
                </TabsContent>
             </Tabs>
             
             <div className="hidden print:block">
                {isResultsDisplayed && results.length > 0 && (
                    <div className="mb-8">
                        <h2 className="text-xl font-semibold my-4">Resume Ranking Results</h2>
                        <ResultsDisplay results={results} />
                    </div>
                )}
                {showInterviewQnA && interviewQnA.length > 0 && (
                    <div>
                        <h2 className="text-xl font-semibold my-4">Interview Q&amp;A</h2>
                        <InterviewQnADisplay qna={interviewQnA} />
                    </div>
                )}
             </div>
          </section>
        )}
      </main>
       <Toaster />
       <footer className="text-center p-4 text-xs text-muted-foreground print:hidden">
         © {new Date().getFullYear()} ResumeRanker. All rights reserved.
       </footer>
    </div>
  );
}
