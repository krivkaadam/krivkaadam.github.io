import React, { useState, useEffect, useRef, useContext } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useMotionTemplate, useMotionValue, animate } from 'framer-motion';
import { Menu, X, ArrowRight, Github, Twitter, Linkedin, Mail, Sparkles, Instagram, Facebook, ArrowUpRight } from 'lucide-react';
import profilePic from "./assets/PP.jpg";
import GlassSurface from './components/GlassSurface';

/**
 * LIQUID GLASS PORTFOLIO - V4.3 (Spotlight Effects & Polish)
 * ------------------------------------------------
 */

const App = () => {
  const [currentView, setCurrentView] = useState('home');
  const [isScrolled, setIsScrolled] = useState(false);
  const { scrollY } = useScroll();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Parallax background effects
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const y2 = useTransform(scrollY, [0, 1000], [0, -150]);

  // Handle scroll for header styling
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
        <motion.div
          style={{ y: y1, x: -100 }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-500 rounded-full blur-[128px] mix-blend-screen"
        />
        <motion.div
          style={{ y: y2, x: 100 }}
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-400 rounded-full blur-[128px] mix-blend-screen"
        />
        {/* Grain Noise */}
        <div className="absolute inset-0 bg-black opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")` }}></div>
      </div>

      {/* --- HEADER --- */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center p-4 md:p-6 perspective-1000">




        {/* 1. OUTER WRAPPER: Handles positioning and smooth shrinking animation */}
        <div
          className={`
    fixed top-0 left-0 right-0 z-50 mx-auto flex justify-center items-center
    transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]
    ${isScrolled
              ? 'w-[95%] md:w-[70%] translate-y-4'  // Shrink state
              : 'w-full md:w-[85%] translate-y-0'   // Full state
            }
  `}
        >
          <GlassSurface
            // 2. COMPONENT: We lock this to 100% so it just fills our animating wrapper
            width="100%"
            displace={0.5}
            
            // Keep a consistent height so it doesn't jump
            height={80}
            className="rounded-full !w-full" // !w-full forces it to respect the wrapper
          >
            {/* 3. INNER LAYOUT: This was missing! It forces content to touch the edges */}
            <div className="flex items-center justify-between w-full h-full px-4 md:px-8">

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
                    <a key={item} href={`#${item.toLowerCase()}`} className="text-[18px] font-medium text-white/90 hover:text-white transition-colors relative group">
                      {item}
                    </a>
                  ))}
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
                <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2 text-white/70">
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

/* --- SPOTLIGHT SYSTEM --- */
const MouseContext = React.createContext(null);

const Spotlight = ({ children, className = "" }) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const spotlightOpacity = useMotionValue(0); // Starts invisible
  const timeoutRef = useRef(null);

  function handleMouseMove({ currentTarget, clientX, clientY }) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);

    // Dynamic Opacity Logic
    // 1. Immediately boost opacity on move (transparency ~40%)
    animate(spotlightOpacity, 0.2, { duration: 0.1, ease: "easeInOut" });

    // 2. Clear any pending decay
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // 3. Set decay timer to ease back to idle state (~10%)
    timeoutRef.current = setTimeout(() => {
      animate(spotlightOpacity, 0.1, { duration: 0.5, ease: "easeInOut" });
    }, 5); // Small buffer before fading down
  }

  function handleMouseEnter() {
    // When entering, go to idle state (10%)
    animate(spotlightOpacity, 0.1, { duration: 0.2 });
  }

  function handleMouseLeave() {
    // When leaving, fade out completely
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    animate(spotlightOpacity, 0, { duration: 0.3 });
  }

  return (
    <MouseContext.Provider value={{ mouseX, mouseY, spotlightOpacity }}>
      <div
        className={`group relative ${className}`}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-spotlight="container"
      >
        {children}
      </div>
    </MouseContext.Provider>
  );
};

const SpotlightItem = ({ children, className = "", delay = 0 }) => {
  const context = useContext(MouseContext);
  // Default values to prevent crash if used outside provider
  const mouseX = context?.mouseX || useMotionValue(0);
  const mouseY = context?.mouseY || useMotionValue(0);
  const spotlightOpacity = context?.spotlightOpacity || useMotionValue(0);

  const itemRef = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!itemRef.current) return;

    const updateOffset = () => {
      // Find the main spotlight container to calculate relative position
      const container = itemRef.current.closest('[data-spotlight="container"]');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = itemRef.current.getBoundingClientRect();
        setOffset({
          x: itemRect.left - containerRect.left,
          y: itemRect.top - containerRect.top
        });
      }
    };

    updateOffset();
    window.addEventListener('resize', updateOffset);
    return () => window.removeEventListener('resize', updateOffset);
  }, []);

  return (
    <motion.div
      ref={itemRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      className={`relative overflow-hidden rounded-[2rem] bg-white/5 ${className}`}
    >
      {/* Spotlight Border Shine - Dynamic Opacity controlled by Spotlight parent */}
      <motion.div
        className="pointer-events-none absolute -inset-px transition duration-300"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              500px circle at calc(${mouseX}px - ${offset.x}px) calc(${mouseY}px - ${offset.y}px),
              rgba(255,255,255, ${spotlightOpacity}),
              transparent 40%
            )
          `,
        }}
      />

      {/* Inner Content Container (covers the center to leave only border shining) */}
      <div className="relative h-full bg-black/20 backdrop-blur-md rounded-[inherit] z-10">
        {children}
      </div>
    </motion.div>
  );
};

/* --- SPECIAL COMPONENT: BUTTON WITH BORDER SHINE --- */
const ShineButton = ({ children, onClick, subtle = false }) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <motion.button
      onClick={onClick}
      onMouseMove={handleMouseMove}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`
        hidden md:flex group relative items-center gap-2 rounded-full overflow-hidden transition-all duration-300 ease-out
        ${subtle
          ? 'px-5 py-2 bg-white/5 ring-1 ring-white/10 hover:ring-white/20'
          : 'px-6 py-2.5 bg-white/10 ring-2 ring-white/10 shadow-lg hover:shadow-purple-500/20'
        }
      `}
    >
      {/* Background Gradient */}
      <div className={`absolute inset-0 z-0 bg-gradient-to-br transition-opacity duration-300 ease-out opacity-0 group-hover:opacity-100 ${subtle ? 'from-white/5 to-white/10' : 'from-purple-500/20 to-blue-500/20'}`} />

      {/* Moving Shine Effect */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-full opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              ${subtle ? '100px' : '150px'} circle at ${mouseX}px ${mouseY}px,
              ${subtle ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)'},
              transparent 80%
            )
          `,
        }}
      />

      <span className={`relative z-10 font-medium ${subtle ? 'text-sm text-white/80' : 'text-sm'}`}>{children}</span>
      {!subtle && <ArrowRight size={14} className="relative z-10 text-purple-300 group-hover:translate-x-1 transition-transform duration-300 ease-out" />}
    </motion.button>
  );
};

/* --- COMPONENT: HOME VIEW --- */
const HomeView = () => (
  <motion.main
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.5, ease: "easeOut" }}
    className="relative z-10 flex flex-col items-center justify-center pt-48 pb-32 px-6"
  >
    <div className="max-w-6xl w-full text-center space-y-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 ring-2 ring-white/20 text-xs font-medium text-purple-200 uppercase tracking-wider mb-4 backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.2)]"
      >
        <Sparkles size={12} className="text-purple-400" />
        <span className="drop-shadow-md">CS Student@FIT - Brno University of Technology</span>
      </motion.div>

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
        I bridge the gap between pure code and intuitive design.
        Welcome to my digital garden of experiments and production-ready apps.
      </p>

      {/* 3D Floating Project Cards with Spotlight - Expanded padding to capture mouse outside */}
      <Spotlight className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 w-full perspective-1000 p-8 -m-8">
        {[1, 2, 3].map((i) => (
          <SpotlightItem key={i} delay={i * 0.1} className="h-72 ring-1 ring-white/10">
            {/* Card Content */}
            <div className="absolute inset-0 p-8 flex flex-col justify-end z-20 transition-transform duration-300 ease-out hover:scale-[1.02]">
              {/* Inner Lighting / Reflection */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/20 opacity-30 pointer-events-none mix-blend-overlay" />

              <h3 className="font-bold text-2xl text-white drop-shadow-md mb-2">Project {i}</h3>
              <p className="text-sm text-white/60">Next.js • TypeScript • WebGL</p>

              {/* Hover Reveal Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-purple-900/40 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 ease-out z-0" />
            </div>
          </SpotlightItem>
        ))}
      </Spotlight>
    </div>
  </motion.main>
);

/* --- COMPONENT: LINKS / LET'S TALK VIEW --- */
const LinksView = () => {
  const links = [
    { name: "GitHub", icon: <Github size={24} />, url: "https://github.com", color: "from-gray-700 to-black" },
    { name: "Twitter / X", icon: <Twitter size={24} />, url: "https://twitter.com", color: "from-blue-900 to-black" },
    { name: "Instagram", icon: <Instagram size={24} />, url: "https://instagram.com", color: "from-purple-900 to-pink-900" },
    { name: "Facebook", icon: <Facebook size={24} />, url: "https://facebook.com", color: "from-blue-800 to-blue-900" },
    { name: "LinkedIn", icon: <Linkedin size={24} />, url: "https://linkedin.com", color: "from-blue-700 to-blue-900" },
    { name: "Email Me", icon: <Mail size={24} />, url: "mailto:hello@example.com", color: "from-emerald-900 to-black" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 pt-32 pb-20"
    >
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-4 drop-shadow-lg">Connect</h2>
          <p className="text-white/40">Find me on the grid.</p>
        </div>

        <Spotlight className="grid grid-cols-1 md:grid-cols-2 gap-4 p-8 -m-8">
          {links.map((link, index) => (
            <SpotlightItem key={link.name} delay={index * 0.1} className="ring-1 ring-white/10 rounded-2xl">
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
            </SpotlightItem>
          ))}
        </Spotlight>
      </div>
    </motion.div>
  );
};

/* --- COMPONENT: FOOTER --- */
const Footer = ({ onLinkClick }) => (
  <footer className="relative z-10 mt-20 border-t border-white/5 bg-black/20 backdrop-blur-3xl shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.5)]">
    <div className="max-w-7xl mx-auto px-6 py-20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-white drop-shadow-lg">Let's build something <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">impossible.</span></h2>
          <p className="text-white/50 max-w-sm">
            Open for freelance projects and technical collaborations.
          </p>
          <div className="flex gap-4">
            <button onClick={onLinkClick} className="text-sm text-purple-300 hover:text-purple-200 underline underline-offset-4 flex items-center gap-1 transition-colors duration-200 ease-out">
              View all socials <span>&rarr;</span>
            </button>
          </div>
        </div>
        <div className="p-8 rounded-[2rem] bg-gradient-to-br from-white/5 to-white/0 ring-1 ring-white/10 shadow-2xl backdrop-blur-md relative overflow-hidden">
          <h3 className="text-lg font-semibold mb-2 drop-shadow-md">Join the inner circle</h3>
          <p className="text-sm text-white/40 mb-6">Get notified when I drop a new project.</p>
          <form className="flex gap-2 relative z-10">
            <input
              type="email"
              placeholder="enter@email.com"
              className="flex-1 bg-black/30 ring-1 ring-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-colors duration-200 ease-out placeholder:text-white/20 shadow-inner"
            />
            <button className="px-6 py-3 bg-white text-black font-bold rounded-xl text-sm hover:bg-gray-200 transition-colors duration-200 ease-out shadow-lg hover:shadow-white/20">Join</button>
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
  <motion.div
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3, ease: "easeOut" }}
    className="fixed inset-0 z-40 bg-black/90 backdrop-blur-3xl pt-24 px-6 md:hidden"
  >
    <div className="flex flex-col gap-6 text-center">
      {['Home', 'Work', 'Lab', 'About'].map((item, i) => (
        <motion.a
          key={item}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1, duration: 0.4, ease: "easeOut" }}
          href={item === 'Home' ? '#' : `#${item.toLowerCase()}`}
          className="text-2xl font-light text-white/80 hover:text-white transition-colors duration-200"
          onClick={() => item === 'Home' ? onNavigate('home') : onClose()}
        >
          {item}
        </motion.a>
      ))}
      <div className="w-full h-px bg-white/10 my-4" />
      <button
        onClick={() => onNavigate('links')}
        className="w-full py-4 rounded-xl bg-white text-black font-bold"
      >
        Let's Talk
      </button>
    </div>
  </motion.div>
);

export default App;