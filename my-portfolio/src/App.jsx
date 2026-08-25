import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight, Github, Twitter, Linkedin, Mail, Sparkles, Instagram, Facebook, ArrowUpRight } from 'lucide-react';
import profilePic from "./assets/PP.jpg";
import GlassSurface from './components/GlassSurface';


const App = () => {
  const [currentView, setCurrentView] = useState('home');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll to top when view changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentView]);

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-purple-500/30 overflow-x-hidden relative">

      {/* --- SHARED BACKGROUND SYSTEM --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.18),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_35%)]" />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* --- HEADER --- */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center p-4 md:p-6 perspective-1000 rounded-full">




        {/* OUTER WRAPPER: Handles positioning and smooth shrinking animation */}
        <div
          className={`
            fixed top-30 left-0 right-0 z-50 mx-auto flex justify-center items-center
            transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] rounded-full
            ${isScrolled ? 'w-[95%] md:w-[70%] translate-y-4' : 'w-full md:w-[85%] translate-y-0'}
          `}
        >
          <GlassSurface
            // COMPONENT: Lock this to 100% so it just fills our animating wrapper
            width="100%"
            displace={0.5}

            // Keep a consistent height so it doesn't jump
            height={80}
            className="!rounded-full !w-full" // !w-full forces it to respect the wrapper
          >
            {/* INNER LAYOUT: Forces content to touch the edges */}
            <div className="flex items-center justify-between w-full h-full px-4 md:px-8 rounded-full">

              {/* LEFT: Logo Section */}
              <div className="flex-1 flex justify-start">
                <div
                  onClick={() => setCurrentView('home')}
                  className="flex items-center gap-3 group cursor-pointer relative z-10"
                >
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden shadow-sm ring-1 ring-white/20">
                    <img
                      src={profilePic}
                      alt="Profile"
                      className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all"
                    />
                  </div>
                  <span className="font-medium text-[15px] text-white/90 group-hover:text-white transition-colors">
                    Adam Křivka
                  </span>
                </div>
              </div>

              {/* CENTER: Navigation */}
              {currentView === 'home' && (
                <nav className="hidden md:flex items-center gap-8 relative z-10">
                  {['Work', 'Lab', 'About', 'Notes'].map((item) => (
                    <a key={item} href={`#${item.toLowerCase()}`} className="text-[20px] font-medium text-white/80 hover:text-white transition-colors relative group">
                      {item}
                      <span className="absolute -bottom-1 left-0 w-0 h-px bg-purple-400 transition-all group-hover:w-full opacity-0 group-hover:opacity-100" />
                    </a>
                  ))}
                  <a href="/ledger/" className="text-[20px] font-medium text-purple-200 hover:text-white transition-colors relative group">
                    Ledger
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-purple-400 transition-all group-hover:w-full opacity-0 group-hover:opacity-100" />
                  </a>
                </nav>
              )}

              {/* RIGHT: Actions */}
              <div className="flex-1 flex justify-end items-center gap-4 relative z-10">
                {currentView === 'links' ? (
                  <ShineButton onClick={() => setCurrentView('home')} subtle>Back</ShineButton>
                ) : (
                  <ShineButton onClick={() => setCurrentView('links')}>Let's Talk</ShineButton>
                )}

                {/* Mobile Menu Toggle */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="md:hidden p-2 text-white/70 hover:text-white transition-colors relative z-50 cursor-pointer active:scale-90 duration-200"
                >
                  {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </div>

            </div>
          </GlassSurface>
        </div>


      </div>

      {/* --- MAIN CONTENT SWITCHER --- */}
      <AnimatePresence mode="wait">
        {currentView === 'home' ? (
          <HomeView key="home" />
        ) : (
          <LinksView key="links" />
        )}
      </AnimatePresence>

      {/* --- FOOTER --- */}
      {currentView === 'home' && <Footer onLinkClick={() => setCurrentView('links')} />}

      {/* --- MOBILE MENU --- */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <MobileMenu
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
            onNavigate={(view) => {
              setCurrentView(view);
              setIsMobileMenuOpen(false);
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

/* --- SIMPLE CARD SYSTEM --- */
const ProjectCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 ${className}`}>
    <div className="relative h-full bg-black/20 backdrop-blur-sm rounded-[inherit]">
      {children}
    </div>
  </div>
);

/* --- SPECIAL COMPONENT: BUTTON WITH BORDER SHINE --- */
const ShineButton = ({ children, onClick, subtle = false }) => (
  <button
    onClick={onClick}
    className={`hidden md:flex items-center gap-2 rounded-full transition-colors duration-200 ${subtle
      ? 'px-5 py-2 bg-white/5 ring-1 ring-white/10 hover:bg-white/10'
      : 'px-6 py-2.5 bg-white/10 ring-2 ring-white/10 hover:bg-white/15'
    }`}
  >
    <span className={`font-medium ${subtle ? 'text-sm text-white/80' : 'text-sm'}`}>{children}</span>
    {!subtle && <ArrowRight size={14} className="text-purple-300" />}
  </button>
);

/* --- COMPONENT: HOME VIEW --- */
const HomeView = () => (
  <main className="relative z-10 flex flex-col items-center justify-center pt-48 pb-32 px-6">
    <div className="max-w-6xl w-full text-center space-y-8">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 ring-2 ring-white/20 text-xs font-medium text-purple-200 uppercase tracking-wider mb-4 backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.2)]">
        <Sparkles size={12} className="text-purple-400" />
        <span className="drop-shadow-md">CS Student@FIT - Brno University of Technology</span>
      </div>

      <h1 className="text-5xl md:text-8xl font-bold tracking-tight pb-4 relative z-10">
        <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40 drop-shadow-2xl">
          Em Construção
        </span>
        <br />
        <span className="bg-clip-text text-transparent bg-gradient-to-b from-white/90 via-white/60 to-white/10">
          Peço que aguarde.
        </span>
      </h1>

      <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed drop-shadow-lg">
        Blending the knowledge obtained throughout the years with AI potential our times offer. Implementing concepts, ideas; Always trying to make my life a bit easier.
      </p>

      <div className="flex flex-wrap justify-center gap-4 pt-2">
        <a
          href="/ledger/"
          className="inline-flex items-center gap-2 rounded-full bg-purple-500/20 px-5 py-3 text-sm font-medium text-purple-100 ring-1 ring-purple-400/30 hover:bg-purple-500/30 hover:text-white"
        >
          Latest project
          <ArrowUpRight size={16} />
        </a>
        <a
          href="/work-tracker/"
          className="inline-flex items-center gap-2 rounded-full bg-white/5 px-5 py-3 text-sm font-medium text-white/80 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
        >
          Nothing 2C here
        </a>
      </div>

      {/* Project cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 w-full p-8 -m-8">
        <ProjectCard className="relative h-96 overflow-hidden">
          <a href="/ledger/" className="absolute inset-0 z-50 cursor-pointer" aria-label="View Work Ledger"></a>
          <img src="/project-1.jpg" alt="Work Ledger preview" className="absolute inset-0 w-full h-full object-cover z-0" />
          <div className="absolute inset-0 bg-black/50 z-10" />
          <div className="absolute inset-0 p-8 flex flex-col justify-end z-20">
            <h3 className="font-bold text-2xl text-white drop-shadow-md mb-2">Work Ledger</h3>
            <p className="text-sm text-white/60">HTML + JS — tracks my work for others</p>
          </div>
        </ProjectCard>

        <ProjectCard className="relative h-96 overflow-hidden">
          <div className="absolute inset-0 bg-black/50 z-10" />
          <div className="absolute inset-0 p-8 flex flex-col justify-end z-20">
            <h3 className="font-bold text-2xl text-white drop-shadow-md mb-2">More to come</h3>
            <p className="text-sm text-white/60">A few projects are still in progress</p>
          </div>
        </ProjectCard>

        <ProjectCard className="relative h-96 overflow-hidden">
          <div className="absolute inset-0 bg-black/50 z-10" />
          <div className="absolute inset-0 p-8 flex flex-col justify-end z-20">
            <h3 className="font-bold text-2xl text-white drop-shadow-md mb-2">Personal touch</h3>
            <p className="text-sm text-white/60">Cannot let poor quality get public</p>
          </div>
        </ProjectCard>
      </div>
    </div>
  </main>
);

/* --- COMPONENT: LINKS / LET'S TALK VIEW --- */
const LinksView = () => {
  const links = [
    { name: "GitHub", icon: <Github size={24} />, url: "https://github.com/krivkaadam", color: "from-gray-700 to-black" },
    { name: "Twitter / X", icon: <Twitter size={24} />, url: "https://x.com/krivkaadam", color: "from-blue-900 to-black" },
    { name: "Instagram", icon: <Instagram size={24} />, url: "https://www.instagram.com/_krivkaadam_", color: "from-purple-900 to-pink-900" },
    { name: "Facebook", icon: <Facebook size={24} />, url: "https://www.facebook.com/adam.krivka.9", color: "from-blue-800 to-blue-900" },
    { name: "LinkedIn (TBD)", icon: <Linkedin size={24} />, url: "", color: "from-blue-700 to-blue-900" },
    { name: "Email Me", icon: <Mail size={24} />, url: "mailto:krivkaad@gmail.com", color: "from-emerald-900 to-black" },
  ];

  return (
    <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 pt-32 pb-20">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-4 drop-shadow-lg">Caught your eye?</h2>
          <p className="text-white/40">All of my digital footprint here</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-8 -m-8">
          {links.map((link) => (
            <ProjectCard key={link.name} className="rounded-2xl">
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="group/item relative flex items-center justify-between p-6 w-full h-full transition-all duration-300 hover:bg-white/[0.03]"
              >
                {/* Subtle background gradient on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${link.color} opacity-0 group-hover/item:opacity-20 transition-opacity duration-300 ease-out`} />

                <div className="flex items-center gap-4 relative z-10">
                  <div className="p-3 rounded-xl bg-white/5 text-white/80 group-hover/item:text-white group-hover/item:bg-white/10 transition-colors duration-300 ease-out shadow-inner">
                    {link.icon}
                  </div>
                  <span className="font-medium text-lg text-white/80 group-hover/item:text-white drop-shadow-md">{link.name}</span>
                </div>

                <ArrowUpRight className="relative z-10 text-white/20 group-hover/item:text-white transition-colors duration-300 ease-out" />
              </a>
            </ProjectCard>
          ))}
        </div>
      </div>
    </div>
  );
};

/* --- COMPONENT: FOOTER --- */
const Footer = ({ onLinkClick }) => (
  <footer className="relative z-10 mt-20 border-t border-white/5 bg-black/20 backdrop-blur-3xl">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-white drop-shadow-lg">Some super visionary <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">quote.</span></h2>
          <p className="text-white/50 max-w-sm">
            Open for thoughtful projects and any collaborations.
          </p>
          <div className="flex gap-4">
            <button onClick={onLinkClick} className="text-sm text-purple-300 hover:text-purple-200 underline underline-offset-4 flex items-center gap-1 transition-colors duration-200 ease-out">
              View all links <span>&rarr;</span>
            </button>
          </div>
        </div>
        <div className="p-8 rounded-[2rem] bg-gradient-to-br from-white/5 to-white/0 ring-1 ring-white/10 shadow-2xl backdrop-blur-md relative overflow-hidden">
          <h3 className="text-lg font-semibold mb-2 drop-shadow-md">Stay in touch</h3>
          <p className="text-sm text-white/40 mb-6">This does not do anything, but the space was empty.</p>
          <form className="flex gap-2 relative z-10">
            <input
              type="email"
              placeholder="enter@email.com"
              className="flex-1 bg-black/30 ring-1 ring-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-colors duration-200 ease-out placeholder:text-white/20 shadow-inner"
            />
            <button className="px-6 py-3 bg-white text-black font-bold rounded-xl text-sm hover:bg-gray-200 transition-colors duration-200 ease-out shadow-lg hover:shadow-white/20">Join us</button>
          </form>

          {/* Decorative ambient light for footer card */}
          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-500/20 blur-[80px] rounded-full pointer-events-none" />
        </div>
      </div>
      <div className="text-center text-xs text-white/20">
        &copy; {new Date().getFullYear()} - Adam Křivka. All rights reserved.
      </div>
    </div>
  </footer>
);

/* --- COMPONENT: MOBILE MENU --- */
const MobileMenu = ({ isOpen, onClose, onNavigate }) => (
  <div className="fixed inset-0 z-40 bg-black/90 backdrop-blur-3xl pt-24 px-6 md:hidden">
    <div className="flex flex-col gap-6 text-center">
      {['Home', 'Work', 'Lab', 'About'].map((item) => (
        <a
          key={item}
          href={item === 'Home' ? '#' : `#${item.toLowerCase()}`}
          className="text-2xl font-light text-white/80 hover:text-white transition-colors duration-200"
          onClick={() => item === 'Home' ? onNavigate('home') : onClose()}
        >
          {item}
        </a>
      ))}
      <a
        href="/ledger/"
        className="text-2xl font-light text-purple-200 hover:text-white transition-colors duration-200"
        onClick={onClose}
      >
        Ledger
      </a>
      <div className="w-full h-px bg-white/10 my-4" />
      <button
        onClick={() => onNavigate('links')}
        className="w-full py-4 rounded-xl bg-white text-black font-bold"
      >
        Let's Talk
      </button>
    </div>
  </div>
);
export default App;