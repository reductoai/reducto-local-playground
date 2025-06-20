import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Download,
  FileText,
  LayoutPanelTop,
  Loader2Icon,
  Upload,
  X,
} from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { components } from "../../schema";
import { clearDocumentFromStore } from "../lib/document-store";
import RenderDocument from "./render-document";
import { Toggle } from "./ui/toggle";

interface DocumentLayoutProps {
  title: string;
  pdfFile: File | undefined;
  setPdfFile: (file: File | undefined) => void;
  numPages: number;
  setNumPages: (pages: number) => void;
  pagination: number;
  setPagination: (page: number) => void;
  jsonOutput:
    | components["schemas"]["ParseResponse"]
    | components["schemas"]["ExtractResponse"]
    | null;
  setJsonOutput: (
    output:
      | components["schemas"]["ParseResponse"]
      | components["schemas"]["ExtractResponse"]
      | null
  ) => void;
  loading: boolean;
  showBlocks: boolean;
  setShowBlocks: (show: boolean) => void;
  onProcessDocument: () => void;
  onScrollToBlock?: (
    chunkIndex: number,
    blockIndex: number,
    isBbox?: boolean,
    color?: string
  ) => void;
  rightPanelContent: ReactNode;
  accordionContent?: ReactNode;
  citations?: components["schemas"]["ExtractResponse"]["citations"];
  jobId?: string | null;
}

function Navigation() {
  const location = useLocation();

  return (
    <div className="flex space-x-2">
      <Link
        to="/parse"
        className={`px-3 py-2 rounded-md text-sm font-medium ${
          location.pathname === "/parse"
            ? "bg-blue-500 text-white"
            : "text-gray-700 hover:text-blue-500 hover:bg-gray-100"
        }`}
      >
        Parse
      </Link>
      <Link
        to="/extract"
        className={`px-3 py-2 rounded-md text-sm font-medium ${
          location.pathname === "/extract"
            ? "bg-blue-500 text-white"
            : "text-gray-700 hover:text-blue-500 hover:bg-gray-100"
        }`}
      >
        Extract
      </Link>
    </div>
  );
}

export default function DocumentLayout({
  title,
  pdfFile,
  setPdfFile,
  numPages,
  setNumPages,
  pagination,
  setPagination,
  jsonOutput,
  setJsonOutput,
  loading,
  showBlocks,
  setShowBlocks,
  onProcessDocument,
  onScrollToBlock,
  rightPanelContent,
  accordionContent,
  citations,
  jobId,
}: DocumentLayoutProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputActive =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;

      if (!isInputActive) {
        const MAX_PAGINATION = 15;
        const minPage = Math.max(0, pagination * MAX_PAGINATION);
        const maxPage = Math.min((pagination + 1) * MAX_PAGINATION, numPages);

        if (e.key === "ArrowRight" && maxPage < numPages) {
          setPagination(pagination + 1);
        } else if (e.key === "ArrowLeft" && minPage > 0) {
          setPagination(pagination - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pagination, numPages, setPagination]);

  const downloadJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!jsonOutput) return;

    const element = document.createElement("a");
    element.href = URL.createObjectURL(
      new Blob([JSON.stringify(jsonOutput, null, 2)], {
        type: "application/json",
      })
    );
    const fileId =
      ("job_id" in jsonOutput ? (jsonOutput as any).job_id : null) ??
      jobId ??
      "result";
    element.download = `${fileId}.json`;
    element.click();
  };

  return (
    <div className="flex flex-col h-screen p-4">
      <Accordion
        type="single"
        collapsible
        defaultValue="controls"
        className="flex-none"
      >
        <AccordionItem value="controls" className="border-none">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex flex-row justify-between grow items-center space-x-2 pr-6">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-semibold">{title}</h1>
                <Navigation />
              </div>

              <div className="flex items-center space-x-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" onClick={downloadJson}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Download JSON Result</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger>
                      <Toggle
                        pressed={showBlocks}
                        onPressedChange={setShowBlocks}
                        onClick={(e) => e.stopPropagation()}
                        variant="outline"
                      >
                        <LayoutPanelTop className="h-4 w-4" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Toggle Block View</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Custom File Display */}
                <div
                  className="flex items-center space-x-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {pdfFile ? (
                    <div
                      className="flex items-center space-x-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 min-w-[280px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FileText className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-blue-900 truncate flex-1">
                        {pdfFile.name}
                      </span>
                      <span className="text-xs text-blue-600">
                        ({(pdfFile.size / 1024 / 1024).toFixed(3)} MB)
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPdfFile(undefined);
                          clearDocumentFromStore();
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="min-w-[280px] justify-start"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerFileUpload();
                      }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choose file...
                    </Button>
                  )}

                  {/* Hidden file input */}
                  <Input
                    ref={fileInputRef}
                    id="pdf-file"
                    type="file"
                    onChange={(e) => {
                      setJsonOutput(null);
                      setPdfFile(e.target.files?.[0]);
                    }}
                    className="hidden"
                  />
                </div>

                <Button
                  onClick={(e) => {
                    onProcessDocument();
                    e.stopPropagation();
                  }}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2Icon className="animate-spin mr-2 h-4 w-4" />
                  ) : null}
                  Process Document
                </Button>
              </div>
            </div>
          </AccordionTrigger>

          {accordionContent && (
            <AccordionContent>
              <div className="controls-section space-y-4 px-1">
                {accordionContent}
              </div>
            </AccordionContent>
          )}
        </AccordionItem>
      </Accordion>

      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 overflow-hidden border rounded-lg shadow-sm"
      >
        <ResizablePanel defaultSize={30} minSize={30} className="p-4">
          <RenderDocument
            pdfFile={pdfFile}
            result={jsonOutput?.result as any}
            loading={loading}
            triggerCall={(pages) => setNumPages(pages)}
            onBboxClick={onScrollToBlock}
            citations={citations}
            onTriggerFileUpload={triggerFileUpload}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={70} minSize={30}>
          {rightPanelContent}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
