import { useState, useRef, useEffect } from "react";
import "../styles/pages.css"; // Ensure we have access to variables

interface ModernDropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    style?: React.CSSProperties;
    className?: string; // Allow passing external classes
}

export default function ModernDropdown({
    value,
    onChange,
    options,
    placeholder = "Select...",
    style,
    className
}: ModernDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const selectedLabel = options.find((opt) => opt.value === value)?.label || placeholder;

    return (
        <div
            ref={dropdownRef}
            className={`modern-dropdown-container ${className || ""}`}
            style={{ ...style, position: "relative", minWidth: "200px" }}
        >
            {/* Trigger */}
            <div
                className={`modern-select ${isOpen ? "open" : ""}`}
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    userSelect: "none",
                    backgroundImage: "none", // Remove CSS arrow
                    paddingRight: "1rem" // Reset padding since no CSS arrow
                }}
            >
                <span style={{ color: value ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {selectedLabel}
                </span>
                {/* Arrow Icon */}
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                        color: "var(--text-secondary)",
                        marginLeft: "0.5rem"
                    }}
                >
                    <path d="M6 8l4 4 4-4" />
                </svg>
            </div>

            {/* Menu */}
            {isOpen && (
                <div
                    className="modern-dropdown-menu"
                    style={{
                        position: "absolute",
                        top: "120%",
                        left: 0,
                        width: "100%",
                        background: "var(--bg-primary)", // Solid background
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "var(--shadow-xl)",
                        zIndex: 1000, // High z-index
                        maxHeight: "250px",
                        overflowY: "auto",
                        animation: "fadeInUp 0.15s ease-out"
                    }}
                >
                    {/* Placeholder option to clear */}
                    <div
                        className="modern-dropdown-item"
                        onClick={() => {
                            onChange("");
                            setIsOpen(false);
                        }}
                        style={{
                            padding: "0.65rem 1rem",
                            cursor: "pointer",
                            fontSize: "var(--font-size-sm)",
                            color: "var(--text-secondary)",
                            fontStyle: "italic",
                            transition: "background 0.1s"
                        }}
                    >
                        {placeholder}
                    </div>

                    {options.map((option) => (
                        <div
                            key={option.value}
                            className={`modern-dropdown-item ${value === option.value ? "selected" : ""}`}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            style={{
                                padding: "0.65rem 1rem",
                                cursor: "pointer",
                                fontSize: "var(--font-size-sm)",
                                color: value === option.value ? "var(--accent)" : "var(--text-primary)",
                                background: value === option.value ? "var(--bg-secondary)" : "transparent",
                                fontWeight: value === option.value ? 600 : 400,
                                borderBottom: "1px solid var(--border-subtle)" // optional separator
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "var(--bg-secondary)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = value === option.value ? "var(--bg-secondary)" : "transparent";
                            }}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
