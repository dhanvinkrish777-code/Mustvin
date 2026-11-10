import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode,
  FolderGit2,
  Info,
  Play,
} from 'lucide-react';
import { PYTHON_FILES, PythonFile } from '../utils/pythonCode';
import { jarvisAudio } from '../utils/audioSystem';

interface PythonCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PythonCodeModal: React.FC<PythonCodeModalProps> = ({ isOpen, onClose }) => {
  const [selectedFile, setSelectedFile] = useState<PythonFile>(PYTHON_FILES[0]);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    jarvisAudio.playAcknowledgeSound();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([selectedFile.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    jarvisAudio.playDimensionLockedSound();
  };

  const handleDownloadAll = () => {
    PYTHON_FILES.forEach((f, idx) => {
      setTimeout(() => {
        const blob = new Blob([f.code], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = f.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, idx * 250);
    });
    jarvisAudio.playDimensionLockedSound();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-6xl h-[88vh] bg-white dark:bg-[#060606] text-black dark:text-white rounded-2xl border border-neutral-300 dark:border-neutral-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0a0a0a] gap-3">
          <div>
            <h2 className="text-base font-display font-bold text-black dark:text-white">
              Jarvis Native Python Repository
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
              SpeechRecognition · pyttsx3 · Gemini SDK · OpenCV Caliper · MediaPipe · Bleak 10m
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadAll}
              className="px-3.5 py-1.5 bg-black text-white dark:bg-white dark:text-black hover:opacity-90 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Bundle</span>
            </button>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-[#161616] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-black dark:text-neutral-200 rounded-lg text-xs transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Main Explorer + Viewer */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white dark:bg-black">
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#090909] p-4 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono text-neutral-600 dark:text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-semibold">
                <FolderGit2 className="w-3.5 h-3.5 text-black dark:text-neutral-300" />
                <span>Source Files</span>
              </div>

              {PYTHON_FILES.map((file) => (
                <button
                  key={file.name}
                  onClick={() => {
                    setSelectedFile(file);
                    jarvisAudio.playAcknowledgeSound();
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs font-mono transition cursor-pointer ${
                    selectedFile.name === file.name
                      ? 'bg-neutral-200 text-black border border-neutral-400 dark:bg-neutral-900 dark:text-white dark:border-neutral-700'
                      : 'text-neutral-700 hover:text-black hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-[#121212] border border-transparent'
                  }`}
                >
                  <FileCode className="w-4 h-4 shrink-0 text-neutral-600 dark:text-neutral-400" />
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>

            <div className="p-3 bg-white dark:bg-black border border-neutral-300 dark:border-neutral-800 rounded-xl text-[11px] font-mono text-black dark:text-neutral-300 space-y-1.5 mt-4">
              <div className="text-black dark:text-white font-semibold flex items-center gap-1">
                <Play className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Run Locally</span>
              </div>
              <div className="p-1.5 rounded bg-neutral-100 dark:bg-[#0d0d0d] border border-neutral-200 dark:border-neutral-900 text-[10px] text-black dark:text-neutral-300 select-all overflow-x-auto">
                pip install -r requirements.txt
              </div>
              <div className="p-1.5 rounded bg-neutral-100 dark:bg-[#0d0d0d] border border-neutral-200 dark:border-neutral-900 text-[10px] text-emerald-700 dark:text-emerald-400 select-all overflow-x-auto">
                python jarvis_master.py
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-white dark:bg-black overflow-hidden">
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#080808] text-xs font-mono gap-2">
              <div className="flex items-center gap-2 text-black dark:text-neutral-300 min-w-0">
                <span className="font-bold text-black dark:text-white shrink-0">
                  {selectedFile.name}
                </span>
                <span className="text-neutral-400 dark:text-neutral-600">·</span>
                <span className="text-neutral-600 dark:text-neutral-400 truncate">
                  {selectedFile.description}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-neutral-100 dark:bg-[#141414] dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-black dark:text-neutral-200 rounded-lg transition cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1 bg-black text-white dark:bg-white dark:text-black hover:opacity-90 font-semibold rounded-lg transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            <div className="flex-1 p-5 overflow-auto bg-white dark:bg-black font-mono text-xs leading-relaxed text-black dark:text-neutral-200 select-text">
              <pre className="whitespace-pre">
                <code>{selectedFile.code}</code>
              </pre>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-2.5 bg-neutral-50 dark:bg-[#0a0a0a] border-t border-neutral-200 dark:border-neutral-800 text-xs font-mono text-neutral-600 dark:text-neutral-500">
          <div className="flex items-center gap-2 text-black dark:text-neutral-300">
            <Info className="w-3.5 h-3.5" />
            <span>Compatible with Python 3.9 – 3.12 on Windows, macOS, and Linux.</span>
          </div>
          <div>Jarvis Desktop Export</div>
        </div>
      </div>
    </div>
  );
};
