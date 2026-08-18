import { useState } from "react";
import { CirclePlus } from "lucide-react";

interface AddTaskProps {
  placeholder: string;
  onAdd: (title: string) => void;
  variant?: "inline" | "capture";
}

export function AddTask({
  placeholder,
  onAdd,
  variant = "inline",
}: AddTaskProps) {
  const [value, setValue] = useState("");
  const capture = variant === "capture";

  const submit = () => {
    const title = value.trim();
    if (!title) return;
    onAdd(title);
    setValue("");
  };

  return (
    <div
      className={
        "flex items-center gap-2.5 border transition-[border-color,background-color,box-shadow] duration-150 " +
        (capture
          ? "min-h-11 rounded-lg border-hairline bg-surface-raised px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.035)] hover:border-soft focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-faint),0_2px_6px_rgba(0,0,0,0.06)]"
          : "min-h-9 rounded-md border-transparent bg-transparent px-2.5 py-1.5 hover:bg-accent-faint focus-within:border-hairline focus-within:bg-surface-raised")
      }
    >
      <span
        className={
          capture
            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"
            : "contents"
        }
      >
        <CirclePlus className="h-4 w-4 shrink-0 text-accent" />
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            setValue("");
          }
        }}
        placeholder={placeholder}
        className={
          "w-full bg-transparent text-text placeholder-muted outline-none " +
          (capture ? "text-[14px] font-medium" : "text-[13px]")
        }
      />
    </div>
  );
}
