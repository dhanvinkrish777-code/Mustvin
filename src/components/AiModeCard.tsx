import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Download,
  ExternalLink,
  Globe,
  Music,
  ShoppingBag,
  Sparkles,
  Store,
  Wand2,
} from 'lucide-react';
import { InlineMathProse } from './NotebookMathRenderer';
import type {
  AiModeData,
  GeneratedImagePayload,
  GeneratedMusicPayload,
  ProductStoreLink,
} from '../contexts/JarvisSessionContext';

interface AiModeCardProps {
  aiMode?: AiModeData;
  generatedImage?: GeneratedImagePayload;
  generatedMusic?: GeneratedMusicPayload;
  onSelectImageForModify?: (dataUrl: string, label: string) => void;
}

const ResilientVisual: React.FC<{
  src?: string;
  alt: string;
  subtitle?: string;
  omitWhenMissing?: boolean;
  onLoadFailed?: () => void;
  className?: string;
}> = ({
  src,
  alt,
  subtitle,
  omitWhenMissing = false,
  onLoadFailed,
  className = 'w-full h-56 object-contain bg-neutral-100 dark:bg-[#09090b]',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    if (omitWhenMissing) {
      return null;
    }
    return (
      <div className="w-full h-52 bg-neutral-100 dark:bg-[#111113] flex flex-col items-center justify-center p-5 text-center border-b border-neutral-200 dark:border-neutral-800">
        {subtitle && (
          <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 mb-1">
            {subtitle}
          </div>
        )}
        <div className="text-base font-display font-bold text-black dark:text-white">{alt}</div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed(true);
        onLoadFailed?.();
      }}
      className={className}
    />
  );
};

const ProductStoreLinksBar: React.FC<{
  links: ProductStoreLink[];
  compact?: boolean;
}> = ({ links, compact = false }) => {
  if (!links || links.length === 0) return null;

  return (
    <div className={compact ? 'pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1.5' : 'pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2'}>
      <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
        <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
        <span>{compact ? 'Check Price & Details' : 'Shop & Research Across Websites'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((link, idx) => {
          const isPrimaryStore = link.kind === 'amazon' || link.kind === 'flipkart';
          return (
            <a
              key={`${link.storeName}-${idx}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-lg text-xs font-medium transition ${
                compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5'
              } ${
                isPrimaryStore
                  ? 'bg-black text-white hover:opacity-90 dark:bg-white dark:text-black font-semibold'
                  : 'bg-neutral-100 text-black hover:bg-neutral-200 border border-neutral-300 dark:bg-[#171717] dark:text-neutral-100 dark:hover:bg-neutral-800 dark:border-neutral-700'
              }`}
            >
              {link.kind === 'amazon' || link.kind === 'flipkart' || link.kind === 'retailer' ? (
                <Store className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Globe className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{link.storeName}</span>
              <ExternalLink className="w-3 h-3 shrink-0 opacity-75" />
            </a>
          );
        })}
      </div>
    </div>
  );
};

export const AiModeCard: React.FC<AiModeCardProps> = ({
  aiMode,
  generatedImage,
  generatedMusic,
  onSelectImageForModify,
}) => {
  const [showLyrics, setShowLyrics] = useState<boolean>(true);
  const [singleVisualFailed, setSingleVisualFailed] = useState<boolean>(false);

  useEffect(() => {
    setSingleVisualFailed(false);
  }, [aiMode?.imageUrl]);

  const handleDownload = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const singleModeLabel =
    aiMode?.cardKind === 'definition'
      ? 'AI Mode · Definition & Explanation'
      : aiMode?.cardKind === 'product_research'
      ? 'AI Mode · Product Research'
      : 'AI Mode · Visual Explanation';

  const showSingleImage = Boolean(aiMode?.imageUrl && !singleVisualFailed);

  return (
    <div className="space-y-4">
      {/* Generated Music Player Card (`lyria-3-clip-preview` / `lyria-3-pro-preview`) */}
      {generatedMusic && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-50 dark:bg-[#0e0e0e] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-black text-white dark:bg-white dark:text-black flex items-center justify-center shrink-0">
                <Music className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-display font-bold text-black dark:text-white">
                  {generatedMusic.durationLabel} · {generatedMusic.modelUsed}
                </div>
                <div className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate max-w-md">
                  {generatedMusic.prompt}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                handleDownload(
                  generatedMusic.audioDataUrl,
                  `jarvis-music-${Date.now()}.${
                    generatedMusic.mimeType.includes('wav') ? 'wav' : 'mp3'
                  }`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Audio</span>
            </button>
          </div>

          <audio
            controls
            src={generatedMusic.audioDataUrl}
            className="w-full h-10 rounded-lg"
          />

          {generatedMusic.lyrics && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowLyrics((v) => !v)}
                className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white cursor-pointer"
              >
                {showLyrics ? 'Hide Lyrics & Arrangement Notes' : 'Show Lyrics & Arrangement Notes'}
              </button>
              {showLyrics && (
                <pre className="mt-2 p-3 rounded-lg bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 text-xs font-sans whitespace-pre-wrap text-neutral-800 dark:text-neutral-200 leading-relaxed max-h-48 overflow-y-auto">
                  {generatedMusic.lyrics}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Generated or Modified Image Card (`gemini-nano-banana-2.1`) */}
      {generatedImage && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-50 dark:bg-[#0e0e0e]">
          <ResilientVisual
            src={generatedImage.imageUrl}
            alt={generatedImage.prompt}
            className="w-full max-h-[440px] object-contain bg-neutral-100 dark:bg-black"
          />
          <div className="px-3.5 py-2.5 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              {generatedImage.wasModified ? 'Modified Image' : 'Generated Image'}
              {generatedImage.modelUsed ? ` · ${generatedImage.modelUsed}` : ''}
            </span>
            <div className="flex items-center gap-2">
              {onSelectImageForModify && (
                <button
                  type="button"
                  onClick={() =>
                    onSelectImageForModify(generatedImage.imageUrl, generatedImage.prompt)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#171717] hover:bg-neutral-100 dark:hover:bg-neutral-800 text-black dark:text-white font-medium transition cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Modify Image</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  handleDownload(
                    generatedImage.imageUrl,
                    `jarvis2-image-${Date.now()}.${
                      generatedImage.imageUrl.includes('image/svg')
                        ? 'svg'
                        : generatedImage.imageUrl.includes('image/jpeg')
                        ? 'jpg'
                        : 'png'
                    }`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black font-semibold hover:opacity-90 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google AI Mode: Side-by-Side Comparison ("This vs That") */}
      {aiMode && aiMode.mode === 'comparison' && aiMode.itemA && aiMode.itemB && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <span>Google AI Mode</span>
              <span aria-hidden="true">·</span>
              <span>Side-by-Side Comparison</span>
            </div>
            <h3 className="text-base sm:text-lg font-display font-bold text-black dark:text-white">
              {aiMode.headline}
            </h3>
            <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed">
              <InlineMathProse text={aiMode.summary} />
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[aiMode.itemA, aiMode.itemB].map((side, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0f0f0f] overflow-hidden flex flex-col"
              >
                {side.imageUrl && (
                  <ResilientVisual
                    src={side.imageUrl}
                    alt={side.name}
                    subtitle={side.subtitle}
                    omitWhenMissing
                    className="w-full h-52 object-contain bg-neutral-100 dark:bg-[#070709] p-2 border-b border-neutral-200 dark:border-neutral-800"
                  />
                )}
                <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div>
                      <div className="text-sm font-display font-bold text-black dark:text-white">
                        {side.name}
                      </div>
                      {side.subtitle && (
                        <div className="text-xs text-neutral-600 dark:text-neutral-400">
                          {side.subtitle}
                        </div>
                      )}
                    </div>
                    {side.highlights && side.highlights.length > 0 && (
                      <ul className="space-y-1 text-xs text-neutral-800 dark:text-neutral-200">
                        {side.highlights.map((hl, hIdx) => (
                          <li key={hIdx} className="flex items-start gap-1.5">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              •
                            </span>
                            <span>
                              <InlineMathProse text={hl} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {side.storeLinks && side.storeLinks.length > 0 && (
                    <ProductStoreLinksBar links={side.storeLinks} compact />
                  )}
                </div>
              </div>
            ))}
          </div>

          {aiMode.comparisonRows && aiMode.comparisonRows.length > 0 && (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="bg-neutral-100 dark:bg-[#141414] border-b border-neutral-200 dark:border-neutral-800">
                      <th className="py-2.5 px-3 font-semibold text-neutral-600 dark:text-neutral-400 w-1/4">
                        Specification / Aspect
                      </th>
                      <th className="py-2.5 px-3 font-bold text-black dark:text-white w-[37.5%] border-l border-neutral-200 dark:border-neutral-800">
                        {aiMode.itemA.name}
                      </th>
                      <th className="py-2.5 px-3 font-bold text-black dark:text-white w-[37.5%] border-l border-neutral-200 dark:border-neutral-800">
                        {aiMode.itemB.name}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiMode.comparisonRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="border-b last:border-b-0 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-[#111111]"
                      >
                        <td className="py-2.5 px-3 font-semibold text-neutral-700 dark:text-neutral-300 align-top">
                          {row.feature}
                        </td>
                        <td className="py-2.5 px-3 text-black dark:text-neutral-100 align-top border-l border-neutral-200 dark:border-neutral-800">
                          <InlineMathProse text={row.itemAValue} />
                        </td>
                        <td className="py-2.5 px-3 text-black dark:text-neutral-100 align-top border-l border-neutral-200 dark:border-neutral-800">
                          <InlineMathProse text={row.itemBValue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aiMode.verdict && (
            <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#111111] text-xs leading-relaxed text-black dark:text-neutral-200">
              <span className="font-bold">Bottom Line: </span>
              <InlineMathProse text={aiMode.verdict} />
            </div>
          )}
        </div>
      )}

      {/* Google AI Mode: Authentic Web Picture + Definition / Explanation / Product Research */}
      {aiMode && aiMode.mode === 'single_visual' && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {aiMode.cardKind === 'definition' ? (
              <BookOpen className="w-3.5 h-3.5" />
            ) : aiMode.cardKind === 'product_research' ? (
              <ShoppingBag className="w-3.5 h-3.5" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            <span>{singleModeLabel}</span>
            {aiMode.subjectName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-neutral-700 dark:text-neutral-300">{aiMode.subjectName}</span>
              </>
            )}
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0f0f0f] overflow-hidden">
            {showSingleImage && (
              <div className="relative bg-neutral-100 dark:bg-[#070709] border-b border-neutral-200 dark:border-neutral-800">
                <ResilientVisual
                  src={aiMode.imageUrl}
                  alt={aiMode.subjectName || aiMode.headline}
                  subtitle={aiMode.subjectSubtitle}
                  omitWhenMissing
                  onLoadFailed={() => setSingleVisualFailed(true)}
                  className="w-full max-h-72 object-contain mx-auto p-2"
                />
                {aiMode.subjectName && (
                  <div className="px-4 py-1.5 bg-neutral-100/90 dark:bg-[#111111]/90 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-black dark:text-white">
                      {aiMode.subjectName}
                    </span>
                    {aiMode.subjectSubtitle && (
                      <span className="text-neutral-600 dark:text-neutral-400 truncate ml-2">
                        {aiMode.subjectSubtitle}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="p-4 space-y-3.5">
              <div>
                <h3 className="text-base sm:text-lg font-display font-bold text-black dark:text-white">
                  {aiMode.headline || aiMode.subjectName}
                </h3>
                {aiMode.subjectSubtitle && (
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    {aiMode.subjectSubtitle}
                  </p>
                )}
              </div>

              <p className="text-sm text-black dark:text-neutral-200 leading-relaxed">
                <InlineMathProse text={aiMode.summary} />
              </p>

              {aiMode.highlights && aiMode.highlights.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 tabular-nums">
                  {aiMode.highlights.map((hl, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#141414]"
                    >
                      <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 truncate">
                        {hl.label}
                      </div>
                      <div className="text-xs font-semibold text-black dark:text-white mt-0.5 leading-snug">
                        <InlineMathProse text={hl.value} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {aiMode.storeLinks && aiMode.storeLinks.length > 0 && (
                <ProductStoreLinksBar links={aiMode.storeLinks} />
              )}
            </div>
          </div>

          {aiMode.sections && aiMode.sections.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aiMode.sections.map((sec, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#0f0f0f] space-y-1"
                >
                  <div className="text-xs font-bold text-black dark:text-white">{sec.heading}</div>
                  <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    <InlineMathProse text={sec.body} />
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

