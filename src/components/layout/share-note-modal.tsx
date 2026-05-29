"use client";

import * as React from "react";
import { X, Download, Share2, Loader2, Copy, Check } from "lucide-react";
import { cn } from "~/lib/utils";
import { toPng } from "html-to-image";

interface ShareNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  noteTitle: string;
  authorName?: string | null;
}

export function ShareNoteModal({
  isOpen,
  onClose,
  selectedText,
  noteTitle,
  authorName,
}: ShareNoteModalProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isCopied, setIsCopied] = React.useState(false);

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const generateImage = async () => {
    if (!cardRef.current) return null;
    setIsGenerating(true);
    try {
      // Small delay to ensure styles are applied
      await new Promise((resolve) => setTimeout(resolve, 100));
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2, // High quality
      });
      return dataUrl;
    } catch (err) {
      console.error("Failed to generate image", err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    const dataUrl = await generateImage();
    if (dataUrl) {
      const link = document.createElement("a");
      link.download = `leath-note-share-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    }
  };

  const handleCopy = async () => {
    const dataUrl = await generateImage();
    if (dataUrl) {
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
          }),
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy image to clipboard", err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl flex flex-col md:flex-row gap-6 items-center">
        
        {/* Preview Area (The Aesthetic Card) */}
        <div className="flex-1 flex justify-center">
          <div
            ref={cardRef}
            className="relative w-[320px] h-[500px] sm:w-[380px] sm:h-[600px] overflow-hidden shadow-2xl flex flex-col"
            style={{
              background: "linear-gradient(135deg, #2d1f14 0%, #1a0f0a 100%)",
            }}
          >
            {/* Leather Texture Overlay */}
            <div 
              className="absolute inset-0 opacity-40 pointer-events-none"
              style={{
                backgroundImage: "url('/textures/leather-sidebar.png')",
                backgroundRepeat: "repeat",
                backgroundSize: "200px 200px",
              }}
            />

            {/* Gradient Glow */}
            <div className="absolute -top-[20%] -left-[20%] w-[140%] h-[140%] opacity-20 pointer-events-none"
              style={{
                background: "radial-gradient(circle at 30% 30%, #5c4033 0%, transparent 50%)"
              }}
            />

            {/* Logo & Brand at top */}
            <div className="relative pt-8 px-8 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#5c4033] border border-[#1a0f0a] flex items-center justify-center shadow-lg">
                <img src="/leath-note-logo.png" alt="" className="w-5 h-5 object-contain" />
              </div>
              <span className="embossed-text text-sm tracking-[0.2em] uppercase opacity-80">
                Leath Note
              </span>
            </div>

            {/* Content Area */}
            <div className="relative flex-1 flex flex-col justify-center px-10 pb-12 overflow-hidden">
              <div className="relative">
                {/* Decorative Quotes */}
                <span className="absolute -top-10 -left-6 text-6xl text-[#5c4033] opacity-30 font-serif pointer-events-none">“</span>
                
                <div className="relative z-10 flex items-center justify-center min-h-[120px]">
                   <p 
                      className={cn(
                        "text-[#e8dcc8] font-serif italic text-center w-full break-words",
                        selectedText.length > 500 ? "text-sm leading-relaxed" :
                        selectedText.length > 300 ? "text-base leading-relaxed" :
                        selectedText.length > 150 ? "text-xl leading-relaxed" :
                        "text-2xl leading-relaxed"
                      )}
                      style={{ 
                        fontFamily: "'Courier Prime', monospace",
                        textShadow: "0 2px 4px rgba(0,0,0,0.3)",
                        display: "-webkit-box",
                        WebkitLineClamp: 12, // Max lines before truncation
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}>
                    {selectedText || "Select text to share..."}
                  </p>
                </div>

                <span className="absolute -bottom-14 -right-4 text-6xl text-[#5c4033] opacity-30 font-serif pointer-events-none">”</span>
              </div>
            </div>

            {/* Footer Area */}
            <div className="relative px-8 pb-10 mt-auto">
              <div className="h-[1px] w-full bg-[#5c4033] opacity-30 mb-4" />
              <div className="flex flex-col">
                <span className="text-[#e8dcc8] font-bold text-base truncate"
                      style={{ fontFamily: "'Courier Prime', monospace" }}>
                  {noteTitle}
                </span>
                <span className="text-[#c8b89a] text-xs opacity-60 uppercase tracking-widest mt-0.5">
                  {authorName ? `By ${authorName}` : "Personal Note"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls Area */}
        <div className="settings-modal w-full max-w-xs p-6 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="embossed-text text-sm uppercase tracking-wider">Share Note</h3>
            <button onClick={onClose} className="text-[#c8b89a] hover:text-[#e0d4c0]">
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-xs text-[#c8b89a] opacity-70 leading-relaxed">
            Generate an aesthetic image of your selection to share on social media.
          </p>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleCopy}
              disabled={isGenerating}
              className="w-full btn-skeuomorphic-primary py-3 flex items-center justify-center gap-2 group"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isCopied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4 group-hover:scale-110 transition-transform" />
              )}
              {isCopied ? "Copied!" : "Copy Image"}
            </button>

            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="w-full btn-skeuomorphic py-3 flex items-center justify-center gap-2 group"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
              )}
              Download PNG
            </button>
          </div>

          <div className="pt-4 border-t border-[#3d2b1f]">
            <p className="text-[10px] text-[#c8b89a] opacity-50 text-center italic">
              Tip: Long text might be truncated. Try selecting shorter highlights for better aesthetics.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
