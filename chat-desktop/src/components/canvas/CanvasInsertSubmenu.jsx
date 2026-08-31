import React from "react";
import {
  User,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Building2,
  Hash,
  Globe,
  FileText,
  CreditCard,
} from "lucide-react";

const PLACEHOLDER_ITEMS = [
  { id: "name", label: "Full Name", icon: User },
  { id: "email", label: "Email", icon: Mail },
  { id: "phone", label: "Phone", icon: Phone },
  { id: "company", label: "Company", icon: Building2 },
  { id: "address", label: "Address", icon: MapPin },
  { id: "date", label: "Date", icon: Calendar },
  { id: "id", label: "ID Number", icon: Hash },
  { id: "website", label: "Website", icon: Globe },
  { id: "document", label: "Document Title", icon: FileText },
  { id: "amount", label: "Amount", icon: CreditCard },
];

export default function CanvasInsertSubmenu({ style, onSelect }) {
  return (
    <div className="canvas-insert-submenu" style={style} role="listbox" aria-label="Placeholder variables">
      {PLACEHOLDER_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className="canvas-submenu-item"
            role="option"
            onClick={() => onSelect(item.id)}
          >
            <Icon size={14} className="canvas-submenu-icon" />
            <span className="canvas-submenu-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
