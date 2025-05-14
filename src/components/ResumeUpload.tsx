'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons"; // Ensure Icons are imported

interface ResumeUploadProps {
  onResumesChange: (resumes: string, isValid: boolean) => void; // Pass validity state
  clear: boolean;
  onClear: () => void;
}

const ResumeUpload: React.FC<ResumeUploadProps> = ({ onResumesChange, clear, onClear }) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]); // Store uploaded files
  const [combinedText, setCombinedText] = useState(''); // Store combined text from files and textarea
  const [textAreaContent, setTextAreaContent] = useState(''); // Separate state for textarea only
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Function to validate and notify parent
  const validateAndNotify = useCallback((files: File[], text: string) => {
    const isValid = files.length > 0 || text.trim() !== '';
    // Combine text from files and textarea for the parent
    let currentCombinedText = '';
     const fileReadPromises = files.map(file => readFileContent(file).catch(err => {
       console.error(`Error reading file ${file.name} for validation:`, err);
       // If a file fails to read here, maybe show a toast, but don't block validation based on other inputs
       toast({ title: "File Read Error", description: `Could not read ${file.name}. It might be corrupted or incompatible.`, variant: "destructive" });
       return ""; // Return empty string on error during validation read
     }));

     Promise.all(fileReadPromises).then(fileContents => {
         const validFileContents = fileContents.filter(content => content !== null && content.trim() !== '');
         currentCombinedText = validFileContents.join('\n\n\n'); // Separator
         if (currentCombinedText && text.trim()) {
             currentCombinedText += '\n\n\n' + text.trim();
         } else if (text.trim()) {
             currentCombinedText = text.trim();
         }
         setCombinedText(currentCombinedText); // Update local combined state
         onResumesChange(currentCombinedText, isValid);
     });

  }, [onResumesChange, toast]); // Add dependencies


  // Effect to handle external clear signal
  useEffect(() => {
    if (clear) {
      setUploadedFiles([]);
      setTextAreaContent('');
      setCombinedText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset the file input visually
      }
      validateAndNotify([], ''); // Notify parent that it's cleared/invalid
      onClear(); // Signal clear completion
    }
  }, [clear, validateAndNotify, onClear]);

  // Effect to update validation when files or textarea content change
   useEffect(() => {
     validateAndNotify(uploadedFiles, textAreaContent);
   }, [uploadedFiles, textAreaContent, validateAndNotify]);


  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return; // No files selected

    const allowedTypes = [
      'application/pdf',
      'application/msword', // .doc
      'text/plain', // .txt
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    ];
    const validFiles: File[] = [];
    const invalidFileNames: string[] = [];

    files.forEach(file => {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        const isValidExtension = fileExtension && ['pdf', 'doc', 'docx', 'txt'].includes(fileExtension);
        // Looser MIME type check - rely more on extension
        const isValidMimeType = file.type ? allowedTypes.some(type => file.type.startsWith(type.split('/')[0])) : false;


        if (isValidExtension) { // Prioritize extension check
           validFiles.push(file);
        } else {
            console.warn(`Invalid file: ${file.name}, Type: ${file.type}, Extension: ${fileExtension}`);
            invalidFileNames.push(file.name);
        }
    });

    if (invalidFileNames.length > 0) {
        toast({
            title: "Invalid File Type(s)",
            description: `Skipped: ${invalidFileNames.join(', ')}. Only PDF, DOCX, DOC, TXT are allowed.`,
            variant: "destructive",
        });
    }

    setUploadedFiles(prevFiles => [...prevFiles, ...validFiles]); // Append valid files
     // Optionally clear textarea when files are uploaded? Current behavior appends.
    // setTextAreaContent('');

    // Reset the input field value so the same file(s) can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const readFileContent = (file: File): Promise<string | null> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
              if (event.target && typeof event.target.result === 'string') {
                   if (event.target.result.trim() === '') {
                     console.warn(`File "${file.name}" seems empty.`);
                     resolve(""); // Resolve with empty string for empty files
                   } else {
                     // Basic check for common unreadable characters (can be improved)
                     if (event.target.result.includes('')) {
                        console.warn(`File "${file.name}" might contain unreadable characters.`);
                        // Optionally show toast or reject here if strict text is needed
                     }
                     resolve(event.target.result);
                   }
              } else if (event.target && event.target.result instanceof ArrayBuffer) {
                 // Handle ArrayBuffer case if necessary (e.g., for complex parsing)
                 console.warn(`File "${file.name}" read as ArrayBuffer, attempting text decode failed.`);
                 reject(new Error(`Could not read ${file.name} as text.`));
              }
               else {
                  reject(new Error(`Failed to read content of ${file.name}`));
              }
          };
          reader.onerror = (error) => {
               console.error(`FileReader error for ${file.name}:`, error);
              reject(error);
          };
          reader.readAsText(file); // Attempt to read all supported types as text for now
      });
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setTextAreaContent(newText);
    // Validation and notification are handled by the useEffect watching textAreaContent
  };

   const handleClear = () => {
        setUploadedFiles([]);
        setTextAreaContent('');
        setCombinedText('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        validateAndNotify([], ''); // Notify parent
    };

    const removeFile = (indexToRemove: number) => {
        setUploadedFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    };

  return (
    <div className="flex flex-col h-full"> {/* Ensure parent takes full height */}
      <div className="mb-4">
        <Input
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,application/pdf,application/msword,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          id="resumeFiles"
          className="hidden"
          ref={fileInputRef}
          aria-label="Upload Resume Files"
        />
        <label
          htmlFor="resumeFiles"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        >
          <Icons.fileUpload className="mr-2 h-4 w-4" /> Upload Resumes
        </label>

        {/* Display uploaded file names with remove buttons */}
        {uploadedFiles.length > 0 && (
           <div className="mt-3 space-y-1 max-h-24 overflow-y-auto pr-2"> {/* Limit height and add scroll */}
             <p className="text-sm font-medium">Uploaded files:</p>
             <ul className="list-disc list-inside text-sm space-y-1">
               {uploadedFiles.map((file, index) => (
                 <li key={index} className="flex items-center justify-between group">
                   <span className="truncate mr-2 flex-1" title={file.name}>{file.name}</span> {/* Allow span to grow */}
                   <Button
                     variant="ghost"
                     size="icon"
                     className="h-5 w-5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" // Prevent shrinking
                     onClick={() => removeFile(index)}
                     aria-label={`Remove ${file.name}`}
                   >
                     <Icons.close className="h-3 w-3" />
                   </Button>
                 </li>
               ))}
             </ul>
           </div>
         )}
      </div>

       {/* Make Textarea expand */}
       {/* Removed flex-grow from this div, let the textarea define its height based on content and min-height */}
       <div className="mb-4">
         <Textarea
           placeholder="Or paste resume text here (separate multiple resumes with a few blank lines)..."
           value={textAreaContent}
           onChange={handleTextChange}
           className="min-h-[150px] w-full resize-y" // Use resize-y to allow vertical resize by user
           aria-label="Resume Text Input"
         />
       </div>

       {/* Button container: Use margin-top instead of margin-top: auto */}
       <div className="flex justify-end mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={uploadedFiles.length === 0 && !textAreaContent}
            >
             <Icons.close className="mr-2 h-4 w-4" /> {/* Added close icon */}
              Clear Resumes
          </Button>
       </div>
    </div>
  );
};

export default ResumeUpload;
