import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import PracticePage from "@/pages/PracticePage";
import { AuthProvider } from "@/context/AuthContext";
import { WordbookProvider } from "@/context/WordbookContext";

export default function App() {
  return (
    <AuthProvider>
      <WordbookProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/other" element={<div className="text-center text-xl">Other Page - Coming Soon</div>} />
          </Routes>
        </Router>
      </WordbookProvider>
    </AuthProvider>
  );
}
