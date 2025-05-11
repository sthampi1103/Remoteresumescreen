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
import { appInitialized, auth, authInitialized, appCheckInitialized } from '@/app/firebaseConfig'; // Import auth and authInitialized
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
    if (!appInitialized || !authInitialized) {
       console.error("Firebase or Firebase Auth not initialized, cannot check auth state.");
       // Potentially show a global error message or a loading state until initialized
       // For now, we rely on the auth check below to redirect.
      return;
    }
    if (!auth) { // auth object itself might be undefined if initialization failed
       console.error("Auth instance not available from firebaseConfig.");
       router.push('/auth');
       return;
     }

    // App Check specific toast, only if a site key is configured
    if (authInitialized && !appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
      toast({
        title: "App Check Security Alert",
        description: "App Check failed to initialize. Key functionalities (like AI analysis and Q&A generation) will be disabled or will not work correctly. Please check the browser console for detailed error messages (e.g., 'appCheck/recaptcha-error' or debug token issues) and verify your Firebase/Google Cloud App Check configuration (domain authorization, API enabled, correct site key).",
        variant: "destructive",
        duration: Infinity,
      });
    }

    const unsubscribe = auth.onAuthStateChanged(user => {
      if (!user) {
         router.push('/auth');
      }
    });
    return () => unsubscribe();
  }, [router, appInitialized, authInitialized, auth, appCheckInitialized, toast]);


  useEffect(() => {
    // Determine if Start button should be active
    // It requires valid JD, valid resumes, AppCheck to be initialized (if site key is present),
    // and results not already displayed.
    const appCheckReady = appCheckInitialized || !process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY;
    const shouldStartBeActive = isJDValid && areResumesValid && !isResultsDisplayed && appCheckReady && authInitialized;
    setIsStartActive(shouldStartBeActive);

    // Determine if Reset button should be active
    const shouldResetBeActive =
      jobDescription.trim() !== '' ||
      resumesText.trim() !== '' ||
      results.length > 0 ||
      interviewQnA.length > 0 ||
      isResultsDisplayed || showInterviewQnA;
    setIsResetActive(shouldResetBeActive);
  }, [jobDescription, resumesText, results, interviewQnA, isJDValid, areResumesValid, isResultsDisplayed, showInterviewQnA, appCheckInitialized, authInitialized]);

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
        toast({ title: "Authentication Error", description: "Firebase Auth is not ready.", variant: "destructive" });
        return;
    }
    if (!appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
      toast({
        title: "App Check Error",
        description: "Cannot start analysis: App Check is not initialized. Please resolve configuration issues (see console and verify domain authorization, API enablement, and site key).",
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
    setResults([]);
    setIsResultsDisplayed(true);
    setActiveTab("results");
    setIsStartActive(false);
  };

   const handleGenerateQnA = async () => {
      if (!authInitialized || !auth) {
          toast({ title: "Authentication Error", description: "Firebase Auth is not ready for Q&A generation.", variant: "destructive" });
          return;
      }
      if (!appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
        toast({
          title: "App Check Error",
          description: "Cannot generate Q&A: App Check is not initialized. Please resolve configuration issues (see console and verify domain authorization, API enablement, and site key).",
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
      setIsGeneratingQnA(true);
      setQnAGenerationError(null);
      setInterviewQnA([]);
      setShowInterviewQnA(true);
      setActiveTab("questions");

      try {
          const output: GenerateQnAOutput = await generateInterviewQnA({ jobDescription });
          setInterviewQnA(output.qna || []);
          if (!output.qna || output.qna.length === 0) {
            setQnAGenerationError("No Q&A were generated. The job description might be too short or unclear.");
          }
      } catch (err: any) {
          console.error("Error generating interview Q&A:", err);
          if (err.message && (err.message.includes('app-check') || err.message.includes('appCheck/recaptcha-error') || err.message.includes('fetch-status-error'))) {
            setQnAGenerationError("Failed to generate Q&A due to an App Check security error. Please check console for details and verify your Firebase/Google Cloud setup (domain authorization, API enabled, site key).");
          } else {
            setQnAGenerationError(err.message || "An error occurred while generating Q&A.");
          }
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
    setIsStartActive(false);
    setIsResetActive(false);
    setIsResultsDisplayed(false);
    setShowInterviewQnA(false);
    setLoading(false);
    setError(null);
    setIsGeneratingQnA(false);
    setQnAGenerationError(null);
    setIsJDValid(false);
    setAreResumesValid(false);
    setClearJDTrigger(true);
    setClearResumesTrigger(true);
    setActiveTab("results");
  };

  const handleSignOut = async () => {
     if (!authInitialized || !auth) {
       console.error("Auth instance not available for sign out.");
       toast({ title: "Error", description: "Could not sign out, Auth not ready.", variant: "destructive" });
       return;
     }
    try {
      await signOut(auth);
      router.push('/auth');
    } catch (error) {
      console.error("Sign out error:", error);
       toast({ title: "Sign Out Error", description: `Failed to sign out: ${(error as Error).message}`, variant: "destructive" });
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
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!isResultsDisplayed || !jobDescription || !resumesText) {
        return;
      }
      // Check App Check and Auth readiness before AI call
      if (!authInitialized || !auth) {
        setError("Firebase Auth not ready. Cannot perform AI operations.");
        setLoading(false);
        return;
      }
      if (!appCheckInitialized && process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
        setError("App Check not initialized. Cannot perform AI operations. Please check console for 'appCheck/recaptcha-error' details and verify your Firebase/Google Cloud setup (domain authorization, API enabled, site key).");
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
        if (err.message && (err.message.includes('app-check') || err.message.includes('appCheck/recaptcha-error') || err.message.includes('fetch-status-error'))) {
           setError("Failed to analyze resumes due to an App Check security error. Please check console for details and verify your Firebase/Google Cloud setup (domain authorization, API enabled, site key).");
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
  }, [isResultsDisplayed, appCheckInitialized, authInitialized, auth]);


  // General disabled state for critical operations if Firebase/AppCheck is not ready
  const isSystemDisabled = !authInitialized || !auth || (!appCheckInitialized && !!process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_ENTERPRISE_SITE_KEY);


  return (
    <div className="flex flex-col min-h-screen bg-background">
       <div className="relative bg-primary text-primary-foreground p-4 flex flex-col items-center shadow-md">
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
          className="h-20 w-auto rounded-md shadow-md mb-2 object-contain"
          data-ai-hint="logo company"
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
        <h1 className="text-2xl font-bold mt-2">Resume Screening App</h1>
      </div>

      <div className="container mx-auto p-4 flex-grow">
         <div className="bg-card text-card-foreground shadow-md rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">File Converter (PDF/DOCX to TXT)</h2>
            <FileConverter />
         </div>
         <Separator className="my-6" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card text-card-foreground shadow-md rounded-lg p-6 flex flex-col">
            <h2 className="text-xl font-semibold mb-4">Job Description Input</h2>
            <div className="flex-grow">
              <JobDescriptionInput
                onJDChange={handleJDChange}
                clear={clearJDTrigger}
                onClear={() => handleClearComplete('jd')}
              />
            </div>
             <Button
                onClick={handleGenerateQnA}
                disabled={!isJDValid || isGeneratingQnA || isSystemDisabled}
                aria-label="Generate interview Q&A"
                className="mt-4"
                suppressHydrationWarning={true}
              >
                 {isGeneratingQnA ? (
                  <>
                    <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                   <Icons.wand className="mr-2 h-4 w-4" />
                   Generate Q&A
                 </>
                )}
              </Button>
          </div>

          <div className="bg-card text-card-foreground shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Resume Upload</h2>
            <ResumeUpload
              onResumesChange={handleResumesChange}
              clear={clearResumesTrigger}
              onClear={() => handleClearComplete('resumes')}
            />
          </div>
        </div>

        <div className="flex justify-center mt-6 gap-4">
          <Button
            onClick={handleStart}
            disabled={!isStartActive || loading || isSystemDisabled}
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
                <Icons.play className="mr-2 h-4 w-4" />
                Start
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!isResetActive} // Reset should generally be available
            aria-label="Reset inputs and results"
            suppressHydrationWarning={true}
          >
             <Icons.refresh className="mr-2 h-4 w-4" />
            Reset
          </Button>
        </div>

        {(isResultsDisplayed || showInterviewQnA) && (
          <div className="bg-card text-card-foreground shadow-md rounded-lg p-6 mt-6">
             <Tabs value={activeTab} onValueChange={setActiveTab}>
               <TabsList className="grid w-full grid-cols-2">
                 <TabsTrigger value="results" disabled={!isResultsDisplayed}>Resume Ranking</TabsTrigger>
                 <TabsTrigger value="questions" disabled={!showInterviewQnA}>Interview Q&amp;A</TabsTrigger>
               </TabsList>
               <TabsContent value="results">
                 <h2 className="text-xl font-semibold mb-4 sr-only">Results</h2>
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
                            disabled={isSystemDisabled}
                          >
                            <Icons.file className="mr-2 h-4 w-4" />
                            Download XLS
                          </Button>
                        </div>
                    </>
                  ) : isResultsDisplayed ? (
                    <p className="text-center text-muted-foreground mt-4">No ranking results to display.</p>
                  ): null}
               </TabsContent>

                <TabsContent value="questions">
                  <h2 className="text-xl font-semibold mb-4 sr-only">Interview Q&amp;A</h2>
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
                   ) : interviewQnA.length > 0 ? (
                     <>
                       <InterviewQnADisplay qna={interviewQnA} />
                       <div className="flex justify-end mt-4">
                         <Button
                           variant="secondary"
                           onClick={handleDownloadQnAPDF}
                           aria-label="Download Q&A as PDF file"
                           suppressHydrationWarning={true}
                           disabled={isSystemDisabled}
                         >
                           <Icons.fileText className="mr-2 h-4 w-4" />
                           Download PDF
                         </Button>
                       </div>
                     </>
                   ) : showInterviewQnA ? (
                    <p className="text-center text-muted-foreground mt-4">No interview Q&amp;A to display.</p>
                   ) : null}
                </TabsContent>
             </Tabs>
          </div>
        )}
      </div>
       <Toaster />
    </div>
  );
}

    