"use client";

import { Document, Page } from "react-pdf";
import { components } from "../../schema";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import JSZip from "jszip";
import { parseStringPromise } from "xml2js";
import { bboxTypeColors } from "../lib/colors";
import React from "react";
import { read, utils, WorkBook } from "xlsx";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const getDOCXPageCount = async (buffer: ArrayBuffer) => {
  const zip = await JSZip.loadAsync(buffer);

  const appXmlData = await zip.file("docProps/app.xml")?.async("text");
  if (!appXmlData) return 0;

  const parsedAppXml = await parseStringPromise(appXmlData);

  const pageCount = parseInt(parsedAppXml["Pages"][0]) || 0;

  return pageCount;
};

const getPPTXPageCount = async (buffer: ArrayBuffer) => {
  const zip = await JSZip.loadAsync(buffer);

  const slides = Object.keys(zip.files).filter(
    (fileName) =>
      fileName.startsWith("ppt/slides/slide") && fileName.endsWith(".xml")
  );

  const pageCount = slides.length;

  return pageCount;
};

type FlattenedCitation = {
  key: string;
  bbox: {
    page: number;
    top: number;
    left: number;
    width: number;
    height: number;
  };
  type: string;
  content: string;
};
const flattenCitations = (citations: any, prefix = ""): FlattenedCitation[] => {
  if (Array.isArray(citations)) {
    return citations.flatMap((item, index) =>
      flattenCitations(item, `${prefix}${index}.`)
    );
  } else if (typeof citations === "object" && citations !== null) {
    if ("bbox" in citations && "type" in citations && "content" in citations) {
      return [
        {
          key: prefix.slice(0, -1), // Remove trailing dot
          bbox: citations.bbox,
          type: citations.type,
          content: citations.content,
        },
      ];
    }
    return Object.entries(citations).flatMap(([key, value]) =>
      flattenCitations(value, `${prefix}${key}.`)
    );
  }
  return [];
};

interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
  page: number;
}

interface Block {
  bbox: BoundingBox;
  type: string;
}

interface XLSXDisplayerProps {
  xlsxUrl: string;
  blocks?: Block[];
  triggerCall: (numPages: number, exceedsLimits?: boolean) => void;
}

const getTotalCellsInWorkbook = (workbook: WorkBook) => {
  let totalCells = 0;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    // Iterate through all cell references in the sheet
    for (const cellRef in sheet) {
      // Skip metadata properties that start with '!'
      if (!cellRef.startsWith("!")) {
        const cell = sheet[cellRef];
        // Count cell if it has a value (not null/undefined/empty string)
        if (cell.v != null && cell.v !== "") {
          totalCells++;
        }
      }
    }
  });

  return totalCells;
};

const MemoizedCell = React.memo<{
  content: React.ReactNode;
  style: React.CSSProperties;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}>(({ content, style, onMouseEnter, onMouseLeave }) => (
  <TableCell
    style={style}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
  >
    {content}
  </TableCell>
));

MemoizedCell.displayName = "MemoizedCell";

const XLSXDisplayer: React.FC<XLSXDisplayerProps> = ({
  xlsxUrl,
  blocks,
  triggerCall,
}) => {
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [currentSheetIndex, setCurrentSheetIndex] = useState<number>(0);
  const [sheetData, setSheetData] = useState<{ [key: string]: any[][] }>({});
  const [maxColumns, setMaxColumns] = useState<{ [key: string]: number }>({});
  const [hoveredBlock, setHoveredBlock] = useState<Block | null>(null);
  const [isLoadingWorkbook, setIsLoadingWorkbook] = useState(false);

  useEffect(() => {
    const loadWorkbook = async () => {
      if (isLoadingWorkbook) return;
      setIsLoadingWorkbook(true);

      const response = await fetch(xlsxUrl);
      const arrayBuffer = await response.arrayBuffer();
      const wb = read(arrayBuffer);
      setWorkbook(wb);

      const newSheetData: { [key: string]: any[][] } = {};
      const newMaxColumns: { [key: string]: number } = {};

      wb.SheetNames.forEach((sheetName, index) => {
        const data = utils.sheet_to_json(wb.Sheets[sheetName]!, { header: 1 });
        newSheetData[sheetName] = data as any[][];
        let maxCol = 0;
        for (let i = 0; i < data.length; i++) {
          const rowLength = (data[i] as any[]).length;
          if (rowLength > maxCol) maxCol = rowLength;
        }
        newMaxColumns[sheetName] = maxCol;
      });

      setSheetData(newSheetData);
      setMaxColumns(newMaxColumns);
      setCurrentSheetIndex(0);
      triggerCall(wb.SheetNames.length, getTotalCellsInWorkbook(wb) > 5000);
    };
    loadWorkbook();
  }, [xlsxUrl, triggerCall, isLoadingWorkbook]);

  const getRelevantBlock = useCallback(
    (rowIndex: number, colIndex: number, sheetIndex: number) => {
      return (
        blocks?.find(
          (block) =>
            block.bbox.page === sheetIndex + 1 &&
            rowIndex + 1 >= block.bbox.top &&
            rowIndex + 1 < block.bbox.top + block.bbox.height &&
            colIndex + 1 >= block.bbox.left &&
            colIndex + 1 < block.bbox.left + block.bbox.width
        ) || null
      );
    },
    [blocks]
  );

  const getCellStyle = useCallback(
    (rowIndex: number, colIndex: number, sheetIndex: number) => {
      const relevantBlock = getRelevantBlock(rowIndex, colIndex, sheetIndex);

      if (relevantBlock) {
        return {
          position: "relative",
          border: "2px solid #3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
        };
      }

      return {};
    },
    [getRelevantBlock]
  );

  const renderCellContent = useCallback(
    (content: any, rowIndex: number, colIndex: number, sheetIndex: number) => {
      const relevantBlock = getRelevantBlock(rowIndex, colIndex, sheetIndex);

      const isTopLeftCell =
        relevantBlock &&
        rowIndex + 1 === relevantBlock.bbox.top &&
        colIndex + 1 === relevantBlock.bbox.left;

      return (
        <>
          {hoveredBlock === relevantBlock && isTopLeftCell && (
            <span className="absolute left-0 top-0 rounded bg-blue-500 px-1 py-0.5 text-xs text-white">
              {relevantBlock.type}
            </span>
          )}
          {content || ""}
        </>
      );
    },
    [getRelevantBlock, hoveredBlock]
  );

  const handleCellMouseEnter = useCallback(
    (rowIndex: number, colIndex: number, sheetIndex: number) => {
      const relevantBlock = getRelevantBlock(rowIndex, colIndex, sheetIndex);
      setHoveredBlock(relevantBlock);
    },
    [getRelevantBlock]
  );

  const handleCellMouseLeave = useCallback(() => {
    setHoveredBlock(null);
  }, []);

  if (!workbook) return <div>Loading...</div>;

  return (
    <Card className="h-full w-full overflow-y-auto">
      <Tabs
        value={workbook.SheetNames[currentSheetIndex]}
        onValueChange={(value) =>
          setCurrentSheetIndex(workbook.SheetNames.indexOf(value))
        }
      >
        <CardHeader className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="w-fit">
              {workbook.SheetNames.map((sheetName: string) => (
                <TabsTrigger
                  key={sheetName}
                  value={sheetName}
                  className="whitespace-nowrap"
                >
                  {sheetName}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </CardHeader>

        <CardContent>
          {workbook.SheetNames.map((sheetName: string, sheetIndex: number) => (
            <TabsContent key={sheetName} value={sheetName}>
              <div className="overflow-x-auto">
                <Table className="xlsx-table">
                  <TableBody>
                    {sheetData[sheetName]?.map(
                      (row: any[], rowIndex: number) => (
                        <TableRow key={rowIndex}>
                          {Array.from(
                            { length: maxColumns[sheetName] || 0 },
                            (_, cellIndex) => (
                              <MemoizedCell
                                key={cellIndex}
                                style={
                                  getCellStyle(
                                    rowIndex,
                                    cellIndex,
                                    sheetIndex
                                  ) as React.CSSProperties
                                }
                                onMouseEnter={() =>
                                  handleCellMouseEnter(
                                    rowIndex,
                                    cellIndex,
                                    sheetIndex
                                  )
                                }
                                onMouseLeave={handleCellMouseLeave}
                                content={renderCellContent(
                                  row[cellIndex],
                                  rowIndex,
                                  cellIndex,
                                  sheetIndex
                                )}
                              />
                            )
                          )}
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          ))}
        </CardContent>
      </Tabs>
    </Card>
  );
};

interface PDFRendererProps {
  documentUrl: string;
  numPages: number;
  minPage: number;
  maxPage: number;
  triggerCall?: (numPages: number) => void;
  chunks?: components["schemas"]["ParseChunk"][];
  chunksLoading?: boolean;
  citations?: components["schemas"]["ExtractResponse"]["citations"];
  onBboxClick?: (
    chunkIndex: number,
    blockIndex: number,
    isBbox?: boolean,
    color?: string
  ) => void;
}

const PDFRenderer = ({
  documentUrl,
  numPages,
  minPage,
  maxPage,
  triggerCall,
  chunks,
  chunksLoading,
  citations,
  onBboxClick,
}: PDFRendererProps) => {
  const bboxes = useMemo(
    () =>
      (chunks || []).flatMap((r, chunkIndex) =>
        r.blocks.flatMap((b, blockIndex) => ({
          ...b.bbox,
          type: b.type,
          chunkIndex,
          blockIndex,
        }))
      ),
    [chunks]
  );

  const flattenedCitations = useMemo(() => {
    if (!citations) return [];
    return flattenCitations(citations);
  }, [citations]);

  return (
    <div className="h-full w-full overflow-y-auto">
      <Document
        file={documentUrl}
        onLoadSuccess={(e) => {
          if (triggerCall) triggerCall(e.numPages);
        }}
        className="space-y-2"
      >
        {Array.from({ length: numPages }, (_, i) =>
          documentUrl || (i + 1 >= minPage && i + 1 <= maxPage) ? (
            <Page
              key={`page_${i}`}
              pageNumber={i + 1}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="overflow-hidden rounded-lg border"
              scale={2}
            >
              <div className="absolute left-0 top-0 z-20 h-full w-full">
                {!chunksLoading && chunks?.length
                  ? bboxes
                      ?.filter((bbox) => bbox.page === i + 1)
                      .map((bbox) => {
                        return (
                          <div
                            id={`bbox_${bbox.chunkIndex}_${bbox.blockIndex}`}
                            key={`bbox_${bbox.chunkIndex}_${bbox.blockIndex}`}
                            className={`group absolute -z-30 cursor-pointer outline outline-2 outline-${
                              bboxTypeColors[bbox.type] || "gray"
                            }-500 transition-colors bg-${
                              bboxTypeColors[bbox.type] || "gray"
                            }-500 bg-opacity-20 hover:bg-opacity-0`}
                            style={{
                              top: bbox.top * 100 + "%",
                              left: bbox.left * 100 + "%",
                              width: bbox.width * 100 + "%",
                              height: bbox.height * 100 + "%",
                            }}
                            onClick={() =>
                              onBboxClick?.(
                                bbox.chunkIndex,
                                bbox.blockIndex,
                                false,
                                bboxTypeColors[bbox.type] || "gray"
                              )
                            }
                          >
                            <div
                              className={`relative -left-[2px] -top-6 hidden w-fit whitespace-nowrap rounded-t-md bg-${
                                bboxTypeColors[bbox.type] || "gray"
                              }-500 px-2 py-1 text-xs text-white group-hover:block`}
                            >
                              {bbox.type}
                            </div>
                          </div>
                        );
                      })
                  : null}
                {flattenedCitations
                  .filter(({ bbox }) => bbox.page === i + 1)
                  .map(({ key, bbox }, index) => (
                    <div
                      key={`citation_${index}`}
                      id={`bbox_${index}`}
                      className="group absolute -z-30 outline outline-2 outline-blue-500"
                      style={{
                        top: bbox.top * 100 + "%",
                        left: bbox.left * 100 + "%",
                        width: bbox.width * 100 + "%",
                        height: bbox.height * 100 + "%",
                      }}
                    >
                      <div className="relative -left-[2px] -top-6 hidden w-fit whitespace-nowrap rounded-t-md bg-blue-500 px-2 py-1 text-xs text-white group-hover:block">
                        {key}
                      </div>
                    </div>
                  ))}
              </div>
            </Page>
          ) : null
        )}
      </Document>
    </div>
  );
};

interface XLSXRendererProps {
  documentUrl: string;
  triggerCall?: (numPages: number, exceedsLimits?: boolean) => void;
  chunks?: components["schemas"]["ParseChunk"][];
  chunksLoading?: boolean;
}

const XLSXRenderer = ({
  documentUrl,
  triggerCall,
  chunks,
  chunksLoading,
}: XLSXRendererProps) => {
  const blocks = useMemo(
    () =>
      (chunks || []).flatMap((r) =>
        r.blocks.flatMap((b) => ({
          bbox: b.bbox,
          type: b.type,
        }))
      ),
    [chunks]
  );
  return (
    <XLSXDisplayer
      xlsxUrl={documentUrl}
      triggerCall={(num, exceedsLimits) => {
        if (triggerCall) triggerCall(num, exceedsLimits);
      }}
      blocks={blocks}
    />
  );
};

interface DOCXPPTXRendererProps {
  documentUrl: string;
  extension: string;
  triggerCall?: (numPages: number, maxPages?: number) => void;
  minPage?: number;
  maxPage?: number;
  numPages?: number;
  pdfUrl?: string | null;
  chunks?: components["schemas"]["ParseChunk"][];
  chunksLoading?: boolean;
}

const DOCXPPTXRenderer = ({
  documentUrl,
  extension,
  triggerCall,
  minPage,
  maxPage,
  numPages,
  pdfUrl,
  chunks,
  chunksLoading,
}: DOCXPPTXRendererProps) => {
  const [pdfNumPages, setPdfNumPages] = useState(numPages || 0);

  if (pdfUrl) {
    return (
      <PDFRenderer
        documentUrl={pdfUrl}
        chunks={chunks}
        chunksLoading={chunksLoading}
        minPage={minPage || 1}
        maxPage={maxPage || 20}
        numPages={pdfNumPages}
        triggerCall={(numPages) => setPdfNumPages(numPages)}
      />
    );
  } else {
    return (
      <div className="h-full w-full overflow-hidden rounded-lg">
        <iframe
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
            documentUrl
          )}`}
          className="m-[-1px] h-full w-full overflow-y-auto"
          onLoad={async () => {
            if (triggerCall) {
              let pageCount = 1;
              if (extension.slice(-1) === "x") {
                // PPTX / DOCX
                try {
                  const buffer = Buffer.from(
                    (await fetch(documentUrl).then((res) =>
                      res.arrayBuffer()
                    )) as ArrayBuffer
                  );
                  pageCount =
                    (extension === "docx"
                      ? await getDOCXPageCount(buffer)
                      : extension === "pptx"
                      ? await getPPTXPageCount(buffer)
                      : 0) || pageCount;
                } catch {
                  console.error("Unable to parse XML-based Office file");
                }
              }
              triggerCall(pageCount);
            }
          }}
        />
      </div>
    );
  }
};

interface ImageRendererProps {
  documentUrl: string;
  triggerCall?: (numPages: number) => void;
  chunks?: components["schemas"]["ParseChunk"][];
  chunksLoading?: boolean;
  citations?: components["schemas"]["ExtractResponse"]["citations"];
  onBboxClick?: (
    chunkIndex: number,
    blockIndex: number,
    isBbox?: boolean,
    color?: string
  ) => void;
}

const ImageRenderer = ({
  documentUrl,
  triggerCall,
  chunks,
  chunksLoading,
  citations,
  onBboxClick,
}: ImageRendererProps) => {
  // Track whether we've called triggerCall for this documentUrl
  const calledRef = useRef<{ url: string; called: boolean }>({
    url: "",
    called: false,
  });

  // Call triggerCall once when documentUrl changes and chunksLoading is true
  useEffect(() => {
    if (documentUrl && chunksLoading && triggerCall) {
      // Only call if we haven't called for this documentUrl yet
      if (calledRef.current.url !== documentUrl || !calledRef.current.called) {
        calledRef.current = { url: documentUrl, called: true };
        triggerCall(1); // Images are single page
      }
    }
  }, [documentUrl, chunksLoading, triggerCall]);

  const bboxes = useMemo(
    () =>
      (chunks || []).flatMap((r, chunkIndex) =>
        r.blocks.flatMap((b, blockIndex) => ({
          ...b.bbox,
          type: b.type,
          chunkIndex,
          blockIndex,
        }))
      ),
    [chunks]
  );

  const flattenedCitations = useMemo(() => {
    if (!citations) return [];
    return flattenCitations(citations);
  }, [citations]);

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="relative overflow-hidden rounded-lg border">
        <img src={documentUrl} alt="Document" className="w-full" />

        <div className="absolute left-0 top-0 h-full w-full">
          {!chunksLoading && chunks?.length
            ? bboxes.map((bbox, i) => (
                <div
                  id={`bbox_${bbox.chunkIndex}_${bbox.blockIndex}`}
                  key={`bbox_${bbox.chunkIndex}_${bbox.blockIndex}`}
                  className={`group absolute cursor-pointer outline outline-2 transition-all duration-1000 ease-in-out outline-${
                    bboxTypeColors[bbox.type] || "gray"
                  }-500 transition-colors bg-${
                    bboxTypeColors[bbox.type] || "gray"
                  }-500 bg-opacity-20 hover:bg-opacity-0`}
                  style={{
                    top: bbox.top * 100 + "%",
                    left: bbox.left * 100 + "%",
                    width: bbox.width * 100 + "%",
                    height: bbox.height * 100 + "%",
                  }}
                  onClick={() => {
                    onBboxClick?.(
                      bbox.chunkIndex,
                      bbox.blockIndex,
                      false,
                      bboxTypeColors[bbox.type] || "gray"
                    );
                  }}
                >
                  <div
                    className={`relative -left-[2px] -top-6 hidden w-fit whitespace-nowrap rounded-t-md bg-${
                      bboxTypeColors[bbox.type] || "gray"
                    }-500 px-2 py-1 text-xs text-white group-hover:block`}
                  >
                    {bbox.type}
                  </div>
                </div>
              ))
            : null}
          {flattenedCitations.map(({ key, bbox }, index) => (
            <div
              key={`citation_${index}`}
              id={`bbox_${index}`}
              className="group absolute outline outline-2 outline-blue-500"
              style={{
                top: bbox.top * 100 + "%",
                left: bbox.left * 100 + "%",
                width: bbox.width * 100 + "%",
                height: bbox.height * 100 + "%",
              }}
            >
              <div className="relative -left-[2px] -top-6 hidden w-fit whitespace-nowrap rounded-t-md bg-blue-500 px-2 py-1 text-xs text-white group-hover:block">
                {key}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface RenderDocumentProps {
  documentUrl?: string;
  pdfFile?: File;
  pdfUrl?: string | null;
  result?:
    | components["schemas"]["FullResult"]
    | components["schemas"]["UrlResult"];
  citations?: components["schemas"]["ExtractResponse"]["citations"];
  loading?: boolean;
  triggerCall?: (numPages: number, exceedsLimits?: boolean) => void;
  minPage?: number;
  maxPage?: number;
  onBboxClick?: (
    chunkIndex: number,
    blockIndex: number,
    isBbox?: boolean,
    color?: string
  ) => void;
  onTriggerFileUpload?: () => void;
}

const RenderDocument = ({
  documentUrl,
  pdfFile,
  pdfUrl,
  result,
  citations,
  loading,
  triggerCall,
  minPage = 1,
  maxPage = 20,
  onBboxClick,
  onTriggerFileUpload,
}: RenderDocumentProps) => {
  const [numPages, setNumPages] = useState(0);
  const [resultContents, setResultContents] = useState<
    components["schemas"]["FullResult"] | null
  >(null);
  const [resultLoading, setResultsLoading] = useState(true);

  // Use pdfFile if provided, otherwise use documentUrl
  const actualDocumentUrl = useMemo(() => {
    if (pdfFile) {
      return URL.createObjectURL(pdfFile);
    }
    return documentUrl;
  }, [pdfFile, documentUrl]);

  // Get file extension from the original file name, not the blob URL
  const fileExtension = useMemo(() => {
    if (pdfFile) {
      return pdfFile.name.split(".").pop()?.toLowerCase();
    }
    return actualDocumentUrl?.split(".").pop()?.toLowerCase();
  }, [pdfFile, actualDocumentUrl]);

  useEffect(() => {
    if (loading || !result) {
      setResultContents(null);
      setResultsLoading(true);
      return;
    }

    if (result.type === "full") {
      setResultContents(result);
      setResultsLoading(false);
    } else {
      fetch(result.url)
        .then((res) => res.json())
        .then((res) => {
          setResultContents(res);
          setResultsLoading(false);
        });
    }
  }, [loading, result, documentUrl]);

  // Clean up object URL when component unmounts or pdfFile changes
  useEffect(() => {
    return () => {
      if (pdfFile && actualDocumentUrl) {
        URL.revokeObjectURL(actualDocumentUrl);
      }
    };
  }, [pdfFile, actualDocumentUrl]);

  if (!actualDocumentUrl) {
    return (
      <div
        className="h-full flex items-center justify-center text-gray-500 cursor-pointer hover:bg-gray-50 transition-colors border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg"
        onClick={onTriggerFileUpload}
      >
        <div className="text-center">
          <div className="text-4xl mb-4">📄</div>
          <div className="text-lg font-medium">No document selected</div>
          <div className="text-sm text-gray-400 mt-2">
            Click here to upload a file
          </div>
        </div>
      </div>
    );
  }

  // Handle various document types with comprehensive support
  switch (fileExtension) {
    // Excel files
    case "xls":
    case "xlsm":
    case "xlsb":
    case "xlsx":
    case "csv":
      return (
        <XLSXRenderer
          documentUrl={actualDocumentUrl}
          chunks={resultContents?.chunks}
          chunksLoading={resultLoading}
          triggerCall={(num, exceedsLimits) => {
            setNumPages(num);
            if (triggerCall) triggerCall(num, exceedsLimits);
          }}
        />
      );
    // Word documents
    case "doc":
    case "docx":
    case "docm":
    case "dot":
    case "dotx":
    case "dotm":
      return (
        <DOCXPPTXRenderer
          documentUrl={actualDocumentUrl}
          pdfUrl={pdfUrl}
          extension={fileExtension}
          chunks={resultContents?.chunks}
          chunksLoading={resultLoading}
          minPage={minPage}
          maxPage={maxPage}
          numPages={numPages}
          triggerCall={(num) => {
            setNumPages(num);
            if (triggerCall) triggerCall(num);
          }}
        />
      );
    // PowerPoint presentations
    case "ppt":
    case "pptx":
    case "pptm":
    case "pot":
    case "potx":
    case "potm":
    case "pps":
    case "ppsx":
    case "ppsm":
      return (
        <DOCXPPTXRenderer
          documentUrl={actualDocumentUrl}
          pdfUrl={pdfUrl}
          extension={fileExtension}
          chunks={resultContents?.chunks}
          chunksLoading={resultLoading}
          minPage={minPage}
          maxPage={maxPage}
          numPages={numPages}
          triggerCall={(num) => {
            setNumPages(num);
            if (triggerCall) triggerCall(num);
          }}
        />
      );
    // Image files
    case "jpeg":
    case "jpg":
    case "png":
    case "gif":
    case "bmp":
    case "webp":
    case "tiff":
    case "tif":
    case "svg":
      return (
        <ImageRenderer
          documentUrl={actualDocumentUrl}
          chunks={resultContents?.chunks}
          chunksLoading={resultLoading}
          triggerCall={(num) => {
            setNumPages(num);
            if (triggerCall) triggerCall(num);
          }}
          citations={citations}
          onBboxClick={onBboxClick}
        />
      );
    // PDF and all other files (default to PDF renderer)
    case "pdf":
    default:
      return (
        <PDFRenderer
          documentUrl={actualDocumentUrl}
          chunks={resultContents?.chunks}
          citations={citations}
          chunksLoading={resultLoading}
          triggerCall={(num) => {
            setNumPages(num);
            if (triggerCall) triggerCall(num);
          }}
          minPage={minPage}
          maxPage={maxPage}
          numPages={numPages}
          onBboxClick={onBboxClick}
        />
      );
  }
};

export default RenderDocument;
