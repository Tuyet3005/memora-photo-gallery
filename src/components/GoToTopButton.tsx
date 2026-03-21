import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

/**
 * GoToTopButton - Displays a button when user scrolls near the end of page
 * Clicking the button smoothly scrolls back to the top
 */
export default function GoToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has scrolled to near the bottom of the page
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      const windowHeight = window.innerHeight;

      // Show button when within 300px of the bottom
      const isNearBottom = scrollTop + windowHeight >= docHeight - 300;
      setIsVisible(isNearBottom);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll smoothly to top of page
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!isVisible) return null;

  return (
    <Button
      size="icon"
      className="fixed right-4 bottom-20 z-50 h-10 w-10 rounded-full bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl"
      onClick={scrollToTop}
      title="Go to top"
    >
      <ArrowUp className="size-5" />
    </Button>
  );
}
