import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { Attachment } from "../types";
import { usePlanner } from "../store";

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "heic",
  "heif",
]);

function isImage(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTS.has(filename.slice(dot + 1).toLowerCase());
}

// Compact human-readable byte size for the dense footer scale.
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}

function AttachmentRow({
  att,
  absPath,
  thumbUrl,
  onDelete,
}: {
  att: Attachment;
  absPath: string | undefined;
  thumbUrl: string | undefined;
  onDelete: () => void;
}) {
  // JS-driven hover: WKWebView leaves CSS :hover stuck after a drag.
  const [hovered, setHovered] = useState(false);
  const image = isImage(att.filename);
  const openFile = () => {
    if (absPath) openPath(absPath);
  };

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface"
    >
      <button
        onClick={openFile}
        title={`Open ${att.filename}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-hairline bg-surface text-[13px] text-muted"
      >
        {image && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={att.filename}
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden>📎</span>
        )}
      </button>

      <button
        onClick={openFile}
        title={att.filename}
        className="min-w-0 flex-1 truncate text-left text-[14px] text-text hover:text-accent"
      >
        {att.filename}
      </button>

      <span className="shrink-0 tabular-nums text-[10px] text-muted">
        {formatBytes(att.size_bytes)}
      </span>

      <button
        onClick={openFile}
        className={
          "shrink-0 text-[10px] text-muted hover:text-accent " +
          (hovered ? "opacity-100" : "opacity-0")
        }
      >
        open
      </button>

      <button
        onClick={onDelete}
        aria-label="Remove attachment"
        className={
          "shrink-0 text-[10px] text-faint hover:text-alert " +
          (hovered ? "opacity-100" : "opacity-0")
        }
      >
        ✕
      </button>
    </li>
  );
}

export function AttachmentList() {
  const attachments = usePlanner((s) => s.detailAttachments);
  const addAttachments = usePlanner((s) => s.addAttachments);
  const deleteAttachment = usePlanner((s) => s.deleteAttachment);

  // Absolute paths (for opening) and image thumbnail URLs, keyed by attachment
  // id. Both need async resolution (appDataDir + join), so compute them in an
  // effect whenever the attachment list changes.
  const [absPaths, setAbsPaths] = useState<Record<number, string>>({});
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = await appDataDir();
      const nextAbs: Record<number, string> = {};
      const nextThumbs: Record<number, string> = {};
      for (const att of attachments) {
        const abs = await join(base, att.rel_path);
        nextAbs[att.id] = abs;
        if (isImage(att.filename)) nextThumbs[att.id] = convertFileSrc(abs);
      }
      if (!cancelled) {
        setAbsPaths(nextAbs);
        setThumbUrls(nextThumbs);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachments]);

  // Native webview drag-and-drop: while the modal is mounted, dropping files
  // anywhere on the window adds them to the open task. The picker button is the
  // reliable path; this is a convenience on top.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type === "drop" && e.payload.paths.length > 0) {
          addAttachments(e.payload.paths);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [addAttachments]);

  const pickFiles = async () => {
    const sel = await open({ multiple: true });
    if (sel == null) return;
    const paths = Array.isArray(sel) ? sel : [sel];
    if (paths.length > 0) addAttachments(paths);
  };

  return (
    <div>
      <h3 className="mb-1.5 flex items-center justify-between text-[12px] font-medium text-muted">
        <span className="flex items-center gap-2">
          Attachments
          {attachments.length > 0 && (
            <span className="tabular-nums text-muted">
              {attachments.length}
            </span>
          )}
        </span>
        <button
          onClick={pickFiles}
          className="rounded bg-soft px-2 py-0.5 text-[10px] font-medium text-text hover:bg-hairline"
        >
          Add files
        </button>
      </h3>

      <ul className="flex flex-col">
        {attachments.length === 0 && (
          <p className="text-[14px] text-muted">No attachments.</p>
        )}
        {attachments.map((att) => (
          <AttachmentRow
            key={att.id}
            att={att}
            absPath={absPaths[att.id]}
            thumbUrl={thumbUrls[att.id]}
            onDelete={() => deleteAttachment(att.id)}
          />
        ))}
      </ul>
    </div>
  );
}
