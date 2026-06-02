import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

interface RichTextEditorProps {
  initialValue: string;
  placeholder?: string;
  onChange: (html: string) => void;
}

function ToolbarButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded px-1 py-0.5 text-[11px] leading-none " +
        (active
          ? "bg-hairline text-text"
          : "text-muted hover:bg-accent-faint")
      }
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap gap-0.5 border-b border-soft px-1 py-0.5">
      <ToolbarButton
        active={editor.isActive("bold")}
        label="B"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        active={editor.isActive("italic")}
        label="I"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        label="H"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        active={editor.isActive("bulletList")}
        label="• List"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        active={editor.isActive("orderedList")}
        label="1. List"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        active={editor.isActive("codeBlock")}
        label="</>"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
    </div>
  );
}

// Mounted with a key per task, so it initializes from `initialValue` once and
// reports changes via onChange (the parent debounces persistence).
export function RichTextEditor({
  initialValue,
  placeholder,
  onChange,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? "Add details…" }),
    ],
    content: initialValue || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: "rt-content px-2 py-1.5 focus:outline-none" },
    },
  });

  return (
    <div className="rounded-md border border-hairline">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
