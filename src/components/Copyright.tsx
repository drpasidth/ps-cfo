// Copyright footer shown on every page.
export default function Copyright({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-xs text-gray-400 text-center py-3 ${className}`}>
      Copyright © PS Evolution Ltd. ·{" "}
      <a href="mailto:psevolutionth@gmail.com" className="hover:underline">
        psevolutionth@gmail.com
      </a>
    </footer>
  );
}
