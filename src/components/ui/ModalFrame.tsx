import React from "react";

export default function ModalFrame({
  onClose,
  children,
  className = "",
}: {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal admin-modal ${className}`.trim()} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ModalSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ui-modal-section ${className}`.trim()}>{children}</div>;
}
