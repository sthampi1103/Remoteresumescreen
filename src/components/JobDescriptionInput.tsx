'use client';

import {useState, useRef, useEffect, useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea}from '@/components/ui/textarea';
import {Input} from '@/components/ui/input';
import {useToast} from '@/hooks/use-toast';
import {Icons} from "@/components/icons";

interface JobDescriptionInputProps {
  onJDChange: (jd: string, isValid: boolean) => void; // Pass validity state
  clear: boolean;
  onClear: () => void;
}

const JobDescriptionInput: React.FC<JobDescriptionInputProps> = ({
  onJDChange,
  clear,
  onClear,
}) => {
  const [jobDescription, setJobDescription] = useState('');
  const [file, setFile] = useState<File | null>(null); // State holds only one file or null
  const [errorMessage, setErrorMessage] = useState('');
  const {toast} = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndNotify = useCallback((text: string) => {
    const isValid = text.trim() !== '';
    onJDChange(text, isValid);
  }, [onJDChange]);


  useEffect(() => {
    if (clear) {
      setJobDescription('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset the file input
      }
      setErrorMessage('');
      validateAndNotify(''); // Notify parent component that it's now empty/invalid
      onClear(); // Signal clear completion
    }
  }, [clear, validateAndNotify, onClear]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setJobDescription(newText);
    setFile(null); // Clear file if user starts typing
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
    setErrorMessage('');
    validateAndNotify(newText); // Notify parent component
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]; // Get only the first file
    setErrorMessage(''); // Clear previous errors

    if (selectedFile) {
      const allowedTypes = [
        'application/pdf',
        'application/msword', // .doc
        'text/plain', // .txt
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      ];
      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();

      const isValidExtension = fileExtension && ['pdf', 'doc', 'docx', 'txt'].includes(fileExtension);
      const isValidMimeType = selectedFile.type && allowedTypes.includes(selectedFile.type);


      if (!isValidMimeType && !isValidExtension) {
         const errorMsg = `Invalid file type: "${selectedFile.name}". Please upload a PDF, DOCX, DOC, or TXT file.`;
         setErrorMessage(errorMsg);
         toast({ title: "Error", description: errorMsg, variant: "destructive" });
         setFile(null);
         setJobDescription('');
         validateAndNotify('');
         if (fileInputRef.current) fileInputRef.current.value = '';
         return;
      }


      setFile(selectedFile); // Set the single selected file
      setJobDescription(''); // Clear manual text input

      try {
        const fileContent = await readFileContent(selectedFile);
        if (fileContent === null) {
            setFile(null); // Clear file if reading failed
            validateAndNotify('');
            if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
            setJobDescription(fileContent); // Set text content from file
            validateAndNotify(fileContent); // Validate based on file content
        }
      } catch (error) {
        console.error('Error reading file:', error);
        const errorMsg = `Failed to read file "${selectedFile.name}". It might be corrupted or in an unreadable format.`;
        setErrorMessage(errorMsg);
        toast({
          title: 'Error Reading File',
          description: errorMsg,
          variant: 'destructive',
        });
        setFile(null);
        setJobDescription('');
        validateAndNotify('');
         if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } else {
        // If no file is selected (e.g., user cancels dialog), clear the file state
        // but keep existing text input if any
        setFile(null);
        if (!jobDescription) { // Only invalidate if text area is also empty
            validateAndNotify('');
        }
    }
  };

  const readFileContent = (file: File): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = event => {
        if (event.target && typeof event.target.result === 'string') {
          const content = event.target.result;
          if (content.includes('') && file.type !== 'text/plain') {
             console.warn(`File "${file.name}" might contain unreadable characters.`);
          }
          if (content.trim() === '') {
            const errorMsg = `File "${file.name}" appears to be empty or unreadable.`;
            setErrorMessage(errorMsg);
            toast({ title: 'File Error', description: errorMsg, variant: 'destructive' });
            resolve(null); // Resolve null for empty/unreadable files
          } else {
            resolve(content);
          }
        } else {
          reject(new Error('Failed to read file content as text.'));
        }
      };

      reader.onerror = (error) => {
        console.error("FileReader error:", error);
        reject(new Error(`Error reading file "${file.name}"`));
      };

       reader.onabort = () => {
         reject(new Error(`File reading aborted for "${file.name}"`));
       };

      // Attempt to read as text. More robust handling for PDF/DOCX would require libraries.
      // For simplicity, relying on basic text extraction for now.
      reader.readAsText(file);
    });
  };

  const handleClear = () => {
      setJobDescription('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setErrorMessage('');
      validateAndNotify('');
  };

  return (
    // Changed to flex-grow to allow parent button to be at bottom
    <div className="flex flex-col h-full">
      <div className="flex items-center space-x-4 mb-4">
        <Input
          type="file"
          accept=".pdf,.docx,.doc,.txt,application/pdf,application/msword,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          id="jobDescriptionFile"
          ref={fileInputRef}
          className="hidden"
          aria-label="Upload Job Description File"
        />
        <label
          htmlFor="jobDescriptionFile"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 cursor-pointer"
          role="button"
          tabIndex={0}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        >
         <Icons.fileUpload className="mr-2 h-4 w-4" />
          Upload File (1 Max) {/* Indicate single file upload */}
        </label>
        {file && <span className="text-sm truncate" title={file.name}>Selected: {file.name}</span>}
      </div>
      {/* Added flex-grow to textarea wrapper */}
      <div className="flex-grow mb-4">
        <Textarea
          placeholder="Or paste job description here..."
          value={jobDescription}
          onChange={handleTextChange}
          className="min-h-[150px] h-full" // Use h-full to take available space
           aria-label="Job Description Text Input"
        />
      </div>
        {/* Clear button moved slightly up to allow Generate button below */}
        <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={handleClear} disabled={!jobDescription && !file}>
                <Icons.close className="mr-2 h-4 w-4" /> {/* Added close icon */}
                Clear JD
            </Button>
        </div>
      {errorMessage && <p className="text-destructive text-sm mt-2">{errorMessage}</p>}
    </div>
  );
};

export default JobDescriptionInput;
