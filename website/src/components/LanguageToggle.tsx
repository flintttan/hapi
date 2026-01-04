import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function LanguageToggle() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      className="font-bold border-2 border-border shadow-hard hover:translate-y-0.5 hover:shadow-none transition-all w-12"
    >
      {i18n.language.startsWith('zh') ? 'EN' : '中'}
    </Button>
  );
}
