import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart3, 
  ChevronRight, 
  ChevronLeft,
  Activity, 
  LogOut, 
  Zap,
  Bell,
  Clock,
  TrendingUp,
  TrendingDown,
  Timer,
  Trophy,
  XCircle,
  AlertTriangle,
  X,
  CreditCard,
  Settings,
  Users,
  Key,
  Calendar,
  Lock as LockIcon,
  ExternalLink,
  RefreshCw,
  LayoutDashboard
} from 'lucide-react';
import * as d3 from 'd3';
import { supabase } from '../lib/supabase';

// Deriv API Configuration
const APP_ID = '1089';
const WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;

interface TickData {
  epoch: number;
  quote: number;
}

interface PivotPoint {
  price: number;
  type: 'support' | 'resistance';
  score: number;
  zoneSize: number;
}

interface TradeSignal {
  id: string;
  pair: any;
  pairId: string;
  pairName: string;
  type: 'RISE' | 'FALL';
  entryPrice?: number;
  entryTime: number; // epoch
  expirationTime: number; // epoch
  status: 'pending' | 'active' | 'completed';
}

interface TradeResult {
  win: boolean;
  entryPrice: number;
  exitPrice: number;
  signalType: 'RISE' | 'FALL';
}

interface RenkoBrick {
  open: number;
  close: number;
  type: 'up' | 'down';
  epoch: number;
}

const PAIRS = [
  { id: 'R_10', name: 'Volatility 10' },
  { id: '1HZ10V', name: 'Volatility 10 (1s)' },
  { id: 'R_25', name: 'Volatility 25' },
  { id: '1HZ25V', name: 'Volatility 25 (1s)' },
  { id: 'R_50', name: 'Volatility 50' },
  { id: '1HZ50V', name: 'Volatility 50 (1s)' },
  { id: 'R_75', name: 'Volatility 75' },
  { id: '1HZ75V', name: 'Volatility 75 (1s)' },
  { id: 'R_100', name: 'Volatility 100' },
  { id: '1HZ100V', name: 'Volatility 100 (1s)' },
  { id: 'JD10', name: 'Jump 10' },
  { id: 'JD25', name: 'Jump 25' },
  { id: 'JD50', name: 'Jump 50' },
  { id: 'JD75', name: 'Jump 75' },
  { id: 'JD100', name: 'Jump 100' },
];

const TIMEFRAMES = [
  { label: '1M', value: 60 },
  { label: '2M', value: 120 },
  { label: '5M', value: 300 },
  { label: '15M', value: 900 },
  { label: '1H', value: 3600 },
];

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [selectedPair, setSelectedPair] = useState(PAIRS[0]);
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[0]);
  const [ticks, setTicks] = useState<TickData[]>([]);
  const [activeLevels, setActiveLevels] = useState<PivotPoint[]>([]);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(window.innerWidth < 1024);
  const [zoom, setZoom] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setIsSidebarCollapsed(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Signal & Trade State
  const [pendingSignal, setPendingSignal] = useState<TradeSignal | null>(null);
  const [activeTrade, setActiveTrade] = useState<TradeSignal | null>(null);
  const [tradeResult, setTradeResult] = useState<TradeResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("Initializing Scanner...");
  const [serverTime, setServerTime] = useState(Math.floor(Date.now() / 1000));
  
  // Profile & Subscription State
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [redemptionCode, setRedemptionCode] = useState('');
  const [redemptionError, setRedemptionError] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState({ total_signals: 0, total_wins: 0, total_losses: 0 });
  const [adminCodes, setAdminCodes] = useState<any[]>([]);
  const [newCodeType, setNewCodeType] = useState('VIP');
  const [newCodeDays, setNewCodeDays] = useState(7);
  const [isExpired, setIsExpired] = useState(false);
  const [isLimitReached, setIsLimitReached] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const scanWs = useRef<WebSocket | null>(null);

  const [isScanningEnabled, setIsScanningEnabled] = useState(() => {
    const saved = localStorage.getItem('precision_scanner_enabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('precision_scanner_enabled', JSON.stringify(isScanningEnabled));
  }, [isScanningEnabled]);
  
  // Ethiopian Time Converter (UTC+3)
  const formatEthTime = (epoch: number) => {
    const date = new Date(epoch * 1000);
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Africa/Addis_Ababa',
      hour12: true
    }).format(date);
  };

  // Sync Server Time
  useEffect(() => {
    const timer = setInterval(() => {
      setServerTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Profile & Stats
  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Fallback: Create profile if it doesn't exist
    if (!profileData && !error) {
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert([{ id: user.id, email: user.email, plan: 'FREE' }])
        .select()
        .single();
      if (newProfile) profileData = newProfile;
    }

    if (profileData) {
      setProfile(profileData);
      
      // Admin check: Database weight + Hardcoded email as fallback/override
      const ADMIN_EMAILS = ['mirekasaye@gmail.com', 'mihiretukasaye26@gmail.com'];
      const userIsAdmin = profileData.is_admin || (user.email && ADMIN_EMAILS.includes(user.email));
      setIsAdmin(!!userIsAdmin);
      
      // Auto-reset daily signals count if 24-25 hours passed
      const lastReset = new Date(profileData.last_signal_reset_at || 0).getTime();
      const hoursSinceReset = (Date.now() - lastReset) / (1000 * 60 * 60);
      const resetThreshold = profileData.plan === 'VIP' ? 25 : 24;

      if (hoursSinceReset >= resetThreshold && profileData.signals_used_today > 0) {
        await supabase
          .from('profiles')
          .update({ signals_used_today: 0, last_signal_reset_at: new Date().toISOString() })
          .eq('id', profileData.id);
        fetchProfile();
        return;
      }

      // Check for expiration
      if (profileData.plan_expires_at) {
        const expiry = new Date(profileData.plan_expires_at).getTime() / 1000;
        if (serverTime > expiry) {
          setIsExpired(true);
        } else {
          setIsExpired(false);
        }
      } else if (profileData.plan === 'FREE') {
        // FREE users treat as expired for this specific app request if they don't have a plan
        // The user said "plan expired, to continue use redemption code"
        setIsExpired(true);
      }

      // Check for signals limit
      const limits: Record<string, number> = {
        'VIP': 18,
        'ELITE': 30,
        'PRO': 40,
        'MASTER': 50
      };
      
      if (profileData.plan !== 'FREE') {
        const limit = limits[profileData.plan] || 0;
        if (profileData.signals_used_today >= limit) {
          setIsLimitReached(true);
        } else {
          setIsLimitReached(false);
        }
      }
    }
  }, [serverTime]);

  const fetchGlobalStats = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('total_signals, total_wins, total_losses');
    
    if (data) {
      const stats = data.reduce((acc, curr) => ({
        total_signals: acc.total_signals + (curr.total_signals || 0),
        total_wins: acc.total_wins + (curr.total_wins || 0),
        total_losses: acc.total_losses + (curr.total_losses || 0)
      }), { total_signals: 0, total_wins: 0, total_losses: 0 });
      setGlobalStats(stats);
    }
  }, []);

  const fetchAdminCodes = useCallback(async () => {
    if (!isAdmin) return;
    const { data, error } = await supabase
      .from('redemption_codes')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setAdminCodes(data);
  }, [isAdmin]);

  useEffect(() => {
    fetchProfile();
    fetchGlobalStats();
    // Poll stats occasionally
    const interval = setInterval(() => {
      fetchGlobalStats();
      fetchProfile();
    }, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [fetchProfile, fetchGlobalStats]);

  useEffect(() => {
    if (isAdmin) fetchAdminCodes();
  }, [isAdmin, fetchAdminCodes]);

  const handleRedeemCode = async () => {
    setRedemptionError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Find code
    const { data: codeData, error: fetchError } = await supabase
      .from('redemption_codes')
      .select('*')
      .eq('code', redemptionCode)
      .eq('is_used', false)
      .single();

    if (!codeData) {
      setRedemptionError('Invalid or already used code.');
      return;
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + codeData.duration_days);

    // 2. Mark code as used
    await supabase
      .from('redemption_codes')
      .update({ is_used: true, used_by: user.id })
      .eq('id', codeData.id);

    // 3. Update profile
    await supabase
      .from('profiles')
      .update({
        plan: codeData.plan_type,
        plan_expires_at: expiryDate.toISOString(),
        signals_used_today: 0,
        last_signal_reset_at: new Date().toISOString()
      })
      .eq('id', user.id);

    fetchProfile();
    setRedemptionCode('');
  };

  const createCode = async () => {
    const code = `${newCodeType}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const { error } = await supabase
      .from('redemption_codes')
      .insert([{
        code,
        plan_type: newCodeType,
        duration_days: newCodeDays
      }]);
    
    if (!error) fetchAdminCodes();
  };

  const trackSignalUsed = async (win: boolean | null = null) => {
    if (!profile) return;
    
    const updateData: any = {
      signals_used_today: (profile.signals_used_today || 0) + 1,
      total_signals: (profile.total_signals || 0) + 1
    };

    if (win === true) {
      updateData.total_wins = (profile.total_wins || 0) + 1;
    } else if (win === false) {
      updateData.total_losses = (profile.total_losses || 0) + 1;
    }

    await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', profile.id);
    
    fetchProfile();
  };

  const sendTelegramMessage = async (message: string) => {
    if (!isScanningEnabled) return; // Strictly forbid telegram if scanner is manually paused
    const BOT_TOKEN = '8581935670:AAEKWoC2hofH7NU6uJoJtVe8922Jb6ELSuk';
    const CHAT_ID = '-1003805593647';
    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
          parse_mode: 'HTML'
        })
      });
      if (!response.ok) {
        const err = await response.json();
        console.error('Telegram API Error:', err);
      } else {
        console.log('Telegram Message Sent Successfully');
      }
    } catch (e) {
      console.error('Telegram Fetch Error:', e);
    }
  };

  // Background Signal Listener
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socket = new WebSocket(`${protocol}//${host}/ws-signals`);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'NEW_SIGNAL' && isScanningEnabled && !isExpired && !isLimitReached) {
        if (!pendingSignal && !activeTrade) {
          const signal = data.signal;
          setPendingSignal(signal);
          
          // Find the pair object to update chart
          const pairObj = PAIRS.find(p => p.id === signal.pairId) || PAIRS[0];
          setSelectedPair(pairObj);

          // Telegram Logic (Matching your exact format)
          const now = Math.floor(Date.now() / 1000);
          const teleMsg = `
✅ <b>Pair:</b> ${signal.pair}
✅ <b>Duration:</b> 5 Minutes
✅ <b>Signal:</b> ${signal.type === 'RISE' ? 'RISE 🟢' : 'FALL 🔴'}
🔹 <b>Enter at:</b> ${formatEthTime(signal.entryTime)}
`;
          sendTelegramMessage(teleMsg);
          console.log(`[SERVER SIGNAL RECEIVED] ${signal.pair}`);
        }
      }
    };

    return () => socket.close();
  }, [isScanningEnabled, isExpired, isLimitReached, pendingSignal, activeTrade]);

  useEffect(() => {
    if (!isScanningEnabled || activeTrade || isExpired || isLimitReached || pendingSignal) {
      setScanStatus(!isScanningEnabled ? "Scanner Paused" : "Background Scanner Active...");
      return;
    }
    setScanStatus("Background Scanner Active - Waiting for high probability signal...");
  }, [activeTrade, isExpired, isLimitReached, isScanningEnabled, pendingSignal]);

  // Handle Trade lifecycle
  useEffect(() => {
    if (pendingSignal) {
      if (serverTime >= pendingSignal.entryTime && pendingSignal.status === 'pending') {
        // Move to active and Capture Entry Price AT THIS MOMENT
        const entryPrice = lastPrice || 0;
        setActiveTrade({ 
          ...pendingSignal, 
          status: 'active',
          entryPrice: entryPrice 
        });
        setPendingSignal(null);
        console.log(`[TRADE STARTED] ${pendingSignal.pairName} at ${entryPrice}`);
      }
    }

    if (activeTrade) {
      if (serverTime >= activeTrade.expirationTime) {
        // Resolve trade result
        const exitPrice = lastPrice || activeTrade.entryPrice || 0;
        const entryPrice = activeTrade.entryPrice || 0;
        
        const win = activeTrade.type === 'RISE' 
          ? exitPrice > entryPrice 
          : exitPrice < entryPrice;
        
        setTradeResult({
          win,
          entryPrice: activeTrade.entryPrice,
          exitPrice,
          signalType: activeTrade.type
        });
        
        // Track the signal and its result
        trackSignalUsed(win);

        // Send Result to Telegram
        const resultMsg = `
<b>📈 Asset:</b> ${activeTrade.pairName}
<b>Entry Price:</b> ${entryPrice.toFixed(4)}
<b>Exit Price:</b> ${exitPrice.toFixed(4)}
<b>Result:</b> ${win ? 'WIN 🏆' : 'LOSS ❌'}
`;
        sendTelegramMessage(resultMsg);
        
        setActiveTrade(null);
        
        // Clear result after 10 seconds
        setTimeout(() => setTradeResult(null), 10000);
      }
    }
  }, [serverTime, pendingSignal, activeTrade, lastPrice]);

  // Main WebSocket Connection for Active Chart
  useEffect(() => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      subscribe(selectedPair.id, timeframe.value);
    };

    ws.current.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      
      // Handle historical data (Candles for timeframe, Ticks for live)
      if (data.candles) {
        const historyTicks = data.candles.map((c: any) => ({
          epoch: c.epoch,
          quote: c.close
        }));
        setTicks(historyTicks);
        if (historyTicks.length > 0) {
          setLastPrice(historyTicks[historyTicks.length - 1].quote);
        }
      }

      if (data.history) {
        const historyTicks = data.history.times.map((t: number, i: number) => ({
          epoch: t,
          quote: data.history.prices[i]
        }));
        setTicks(historyTicks);
      }

      // Live tick updates for smooth line movement
      if (data.tick) {
        setLastPrice(data.tick.quote);
        setTicks(prev => {
          // If the last tick epoch is the same, update it. Otherwise add new.
          const last = prev[prev.length - 1];
          if (last && Math.floor(data.tick.epoch / timeframe.value) === Math.floor(last.epoch / timeframe.value)) {
            const updated = [...prev];
            updated[updated.length - 1] = { epoch: data.tick.epoch, quote: data.tick.quote };
            return updated;
          }
          const newTicks = [...prev, { epoch: data.tick.epoch, quote: data.tick.quote }];
          return newTicks.slice(-500);
        });
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [selectedPair.id, timeframe.value]);

  // Update subscription when pair or timeframe changes
  useEffect(() => {
    setTicks([]); 
    setActiveLevels([]); // Clear old levels immediately on asset change
    subscribe(selectedPair.id, timeframe.value);
  }, [selectedPair, timeframe]);

  const subscribe = (symbol: string, granularity: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ forget_all: 'ticks' }));
      ws.current.send(JSON.stringify({ forget_all: 'candles' }));
      
      // Request history based on granularity
      ws.current.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: 500,
        end: 'latest',
        granularity: granularity,
        style: granularity === 1 ? 'ticks' : 'candles'
      }));

      // Always subscribe to ticks for live price updates
      ws.current.send(JSON.stringify({
        ticks: symbol,
        subscribe: 1
      }));
    }
  };

  // Renko Waves Calculation
  const renkoBricks = useMemo(() => {
    if (ticks.length < 20) return [];
    
    // Calculate ATR(14) for the main chart
    const currentQuote = ticks[ticks.length - 1].quote;
    let atr = 0;
    const windows = [];
    for (let i = 1; i < Math.min(ticks.length, 100); i++) {
        windows.push(Math.abs(ticks[i].quote - ticks[i-1].quote));
    }
    atr = windows.slice(-14).reduce((a, b) => a + b, 0) / 14;
    
    const brickSize = atr > 0 ? atr : currentQuote * 0.0003;
    
    const bricks: RenkoBrick[] = [];
    let prevClose = ticks[0].quote;

    for (let i = 1; i < ticks.length; i++) {
        const price = ticks[i].quote;
        const diff = price - prevClose;
        
        if (Math.abs(diff) >= brickSize) {
            const numBricks = Math.floor(Math.abs(diff) / brickSize);
            for (let j = 0; j < numBricks; j++) {
                const bType = diff > 0 ? 'up' : 'down';
                const open = prevClose;
                const bClose = prevClose + (diff > 0 ? brickSize : -brickSize);
                bricks.push({ open, close: bClose, type: bType, epoch: ticks[i].epoch });
                prevClose = bClose;
            }
        }
    }
    
    return bricks;
  }, [ticks]);

    // High-Precision Support & Resistance Zones using Renko Pivots
    useEffect(() => {
      if (renkoBricks.length < 10) {
        setActiveLevels([]);
        return;
      }
  
      const currentQuote = ticks[ticks.length - 1]?.quote || 0;
      const brickSize = currentQuote * 0.0003;
      const rawLevels: PivotPoint[] = [];
      const zoneSize = brickSize * 2.5;

      // Extract structural levels from Renko reversals
      for (let i = 2; i < renkoBricks.length - 1; i++) {
          if (renkoBricks[i-1].type !== renkoBricks[i].type) {
              rawLevels.push({
                  price: renkoBricks[i].open,
                  type: renkoBricks[i].type === 'up' ? 'support' : 'resistance',
                  score: 1,
                  zoneSize
              });
          }
      }

      // Consolidate nearby pivots into strong zones
      const zones = rawLevels.reduce((acc: PivotPoint[], curr) => {
        const match = acc.find(z => z.type === curr.type && Math.abs(z.price - curr.price) < zoneSize * 3);
        if (match) {
          match.score += 1;
          match.price = (match.price * match.score + curr.price) / (match.score + 1);
        } else {
          acc.push(curr);
        }
        return acc;
      }, []);

      // Priority: Find the MOST EXTREME peaks and troughs (Top & Bottom)
      const resistances = zones.filter(z => z.type === 'resistance').sort((a, b) => b.price - a.price);
      const supports = zones.filter(z => z.type === 'support').sort((a, b) => a.price - b.price);
      
      const finalLevels: PivotPoint[] = [];
      
      // Grab the absolute Top and absolute Bottom from visible context
      if (resistances.length > 0) finalLevels.push(resistances[0]); // Major Top
      if (supports.length > 0) finalLevels.push(supports[0]);    // Major Bottom
      
      // If we have room, add the second most significant levels
      if (resistances.length > 1 && resistances[1].score >= 2) finalLevels.push(resistances[1]);
      if (supports.length > 1 && supports[1].score >= 2) finalLevels.push(supports[1]);

      setActiveLevels(finalLevels.slice(0, 4));
    }, [ticks, renkoBricks]);

  // Chart Rendering with D3
  useEffect(() => {
    if (!chartContainerRef.current || renkoBricks.length === 0) {
      return;
    }

    const container = chartContainerRef.current;
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 40, right: 100, bottom: 40, left: 40 };

    d3.select(container).selectAll('*').remove();
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('class', 'overflow-visible');

    const visibleBricksCount = Math.max(10, Math.floor(60 / zoom));
    const displayBricks: RenkoBrick[] = renkoBricks.slice(-visibleBricksCount);

    const rightGap = 100;
    const x = d3.scaleLinear()
      .domain([0, displayBricks.length - 1])
      .range([margin.left, width - margin.right - rightGap]);

    const y = d3.scaleLinear()
      .domain([
        ((d3.min(displayBricks, d => Math.min(d.open, d.close)) || 0) as number) * 0.9998,
        ((d3.max(displayBricks, d => Math.max(d.open, d.close)) || 0) as number) * 1.0002
      ])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Renko Bricks drawing
    const brickWidth = (width - margin.left - margin.right - rightGap) / displayBricks.length * 0.8;

    svg.selectAll<SVGRectElement, RenkoBrick>('.brick')
      .data(displayBricks)
      .enter()
      .append('rect')
      .attr('class', 'brick')
      .attr('x', (_, i) => x(i) - brickWidth / 2)
      .attr('y', (d: RenkoBrick) => y(Math.max(d.open, d.close)))
      .attr('width', brickWidth)
      .attr('height', (d: RenkoBrick) => Math.abs(y(d.open) - y(d.close)) || 1)
      .attr('fill', (d: RenkoBrick) => d.type === 'up' ? '#10b981' : '#ef4444')
      .attr('stroke', (d: RenkoBrick) => d.type === 'up' ? '#059669' : '#b91c1c')
      .attr('stroke-width', 1)
      .attr('opacity', 0.9);

    // Support/Resistance Zones Visualization
    activeLevels.forEach(level => {
      const yPos = y(level.price);
      const zoneHeight = Math.abs(y(level.price - level.zoneSize / 2) - y(level.price + level.zoneSize / 2));
      
      if (yPos >= margin.top && yPos <= height - margin.bottom) {
        const color = level.type === 'support' ? '#10b981' : '#ef4444';
        const g = svg.append('g');
        
        // Use a gradient-like transparency for the zone
        g.append('rect')
          .attr('x', 0)
          .attr('y', yPos - zoneHeight / 2)
          .attr('width', width - margin.right)
          .attr('height', zoneHeight)
          .attr('fill', color)
          .attr('opacity', 0.1);

        g.append('line')
          .attr('x1', 0)
          .attr('x2', width - margin.right)
          .attr('y1', yPos)
          .attr('y2', yPos)
          .attr('stroke', color)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '8,4')
          .attr('opacity', 0.8);

        // Strength / Label bg
        g.append('rect')
          .attr('x', width - margin.right + 2)
          .attr('y', yPos - 12)
          .attr('width', 85)
          .attr('height', 24)
          .attr('fill', '#1e293b')
          .attr('stroke', color)
          .attr('stroke-width', 1)
          .attr('rx', 4);

        g.append('text')
          .attr('x', width - margin.right + 44)
          .attr('y', yPos + 0)
          .attr('fill', color)
          .attr('font-size', '9px')
          .attr('font-family', 'monospace')
          .attr('text-anchor', 'middle')
          .attr('class', 'font-black uppercase tracking-tighter')
          .text(`${level.type}`);

        g.append('text')
          .attr('x', width - margin.right + 44)
          .attr('y', yPos + 9)
          .attr('fill', 'white')
          .attr('font-size', '8px')
          .attr('font-family', 'monospace')
          .attr('text-anchor', 'middle')
          .attr('opacity', 0.6)
          .text(`${level.price.toFixed(4)}`);
      }
    });

    // Current Price Indicator
    if (lastPrice !== null) {
      const g = svg.append('g');
      const yPos = y(lastPrice);
      
      g.append('line')
        .attr('x1', margin.left)
        .attr('x2', width - margin.right)
        .attr('y1', yPos)
        .attr('y2', yPos)
        .attr('stroke', 'rgba(255,255,255,0.4)')
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '2,2');

      g.append('rect')
        .attr('x', width - margin.right + 2)
        .attr('y', yPos - 10)
        .attr('width', 70)
        .attr('height', 20)
        .attr('fill', 'rgb(59, 130, 246)')
        .attr('rx', 2);

      g.append('text')
        .attr('x', width - margin.right + 37)
        .attr('y', yPos + 4)
        .attr('fill', 'white')
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('font-family', 'monospace')
        .text(lastPrice.toFixed(4));
    }

  }, [ticks, renkoBricks, activeLevels, lastPrice, zoom]);

  return (
    <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden font-sans">
      {/* Sidebar - Minimizable */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarCollapsed ? (isMobile ? 0 : 80) : 280,
          x: isSidebarCollapsed && isMobile ? -280 : 0
        }}
        className={`border-r border-white/5 bg-slate-900/40 backdrop-blur-3xl flex flex-col z-[100] shadow-2xl transition-all duration-300 ${isMobile ? 'fixed inset-y-0 left-0' : 'relative'}`}
      >
        {!isSidebarCollapsed && isMobile && (
          <button 
            onClick={() => setIsSidebarCollapsed(true)}
            className="absolute top-6 right-[-50px] p-2 bg-slate-900 border border-white/5 rounded-full text-white z-[110]"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <div className={`p-6 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} border-b border-white/5 h-20`}>
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-600 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                <Zap size={18} className="text-white fill-white" />
              </div>
              <span className="font-black italic tracking-tighter text-white text-xl">ET OPTION</span>
            </div>
          )}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-500 hover:text-white"
          >
            <ChevronLeft size={20} className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
          {isAdmin && (
            <div>
              <h3 className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Administration</h3>
              <button
                onClick={() => setShowAdminPanel(true)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all border border-blue-500/20 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10`}
              >
                <Settings size={20} />
                {!isSidebarCollapsed && <span className="text-sm font-bold tracking-tight">Admin Control</span>}
              </button>
            </div>
          )}

          <div>
            {!isSidebarCollapsed && <h3 className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Market Assets</h3>}
            <div className="space-y-1">
              {PAIRS.map((pair) => (
                <button
                  key={pair.id}
                  onClick={() => setSelectedPair(pair)}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all group ${
                    selectedPair.id === pair.id 
                      ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20 shadow-[0_5px_15px_-5px_rgba(37,99,235,0.2)]' 
                      : 'text-slate-500 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <BarChart3 size={20} className={selectedPair.id === pair.id ? 'text-blue-400' : 'text-slate-600 group-hover:text-slate-300'} />
                  {!isSidebarCollapsed && (
                    <div className="flex flex-col items-start min-w-0">
                      <span className="text-sm font-bold truncate tracking-tight">{pair.name}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/5 space-y-4">
          {profile && (
            <div className={`px-4 py-3 bg-white/5 rounded-2xl border border-white/5 ${isSidebarCollapsed ? 'flex justify-center' : ''}`}>
              {isSidebarCollapsed ? (
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Authenticated</p>
                  <p className="text-[10px] font-medium text-slate-300 truncate font-mono">{profile.email}</p>
                </>
              )}
            </div>
          )}
          <button 
            onClick={onLogout}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-4'} py-3.5 text-slate-500 hover:text-red-400 hover:bg-red-400/5 rounded-2xl transition-all font-bold text-xs uppercase tracking-widest`}
          >
            <LogOut size={18} />
            {!isSidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[#020617]">
        {/* Mobile Toggle Button (Visible only when sidebar is hidden on mobile) */}
        {isMobile && isSidebarCollapsed && (
          <button 
            onClick={() => setIsSidebarCollapsed(false)}
            className="absolute top-4 left-4 z-[90] p-3 bg-slate-900 border border-white/10 rounded-2xl text-blue-500 shadow-xl shadow-black/50"
          >
            <ChevronRight size={24} />
          </button>
        )}
        {/* Top Header */}
        <header className={`border-b border-white/5 flex flex-wrap items-center justify-between px-4 md:px-10 bg-slate-900/10 backdrop-blur-md z-10 transition-all ${isMobile ? 'py-4 gap-4' : 'h-20'}`}>
          <div className={`flex items-center gap-4 md:gap-6 ${isMobile && isSidebarCollapsed ? 'pl-16' : ''}`}>
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <span className="text-lg md:text-2xl font-black text-white tracking-tighter italic uppercase truncate max-w-[150px] md:max-w-none">{selectedPair.name}</span>
                <div className="h-4 w-[1px] bg-white/10" />
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">Active</span>
              </div>
              {isMobile && profile && (
                <span className="text-[8px] font-mono text-slate-500 truncate max-w-[120px] mt-0.5">{profile.email}</span>
              )}
            </div>
          </div>

          <div className={`flex items-center gap-4 md:gap-8 ${isMobile ? 'w-full justify-between overflow-x-auto pb-2 scrollbar-hide' : ''}`}>
            <button
              onClick={() => setIsScanningEnabled(!isScanningEnabled)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all font-black text-[10px] uppercase tracking-widest ${
                isScanningEnabled 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20' 
                  : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${isScanningEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {isScanningEnabled ? 'Scanner Active' : 'Scanner Paused'}
            </button>
            {profile && (
              <div className="flex items-center gap-2 md:gap-4 px-3 md:px-4 py-2 bg-white/5 rounded-2xl border border-white/5 flex-shrink-0">
                <div className="flex flex-col items-end">
                  <span className="text-[8px] md:text-[9px] text-slate-500 font-black uppercase tracking-widest">Plan</span>
                  <span className={`text-[10px] md:text-xs font-black ${
                    profile.plan === 'MASTER' ? 'text-yellow-400' : 
                    profile.plan === 'PRO' ? 'text-purple-400' : 
                    profile.plan === 'ELITE' ? 'text-blue-400' : 
                    'text-emerald-400'
                  }`}>
                    {profile.plan}
                  </span>
                </div>
                <div className="h-8 w-[1px] bg-white/10" />
                <div className="flex flex-col items-center">
                  <span className="text-[8px] md:text-[9px] text-slate-500 font-black uppercase tracking-widest">Signals</span>
                  <span className="text-[10px] md:text-xs font-mono font-black text-white">
                    {profile.signals_used_today}/{
                      profile.plan === 'VIP' ? 18 : 
                      profile.plan === 'ELITE' ? 30 : 
                      profile.plan === 'PRO' ? 40 : 
                      profile.plan === 'MASTER' ? 50 : 0
                    }
                  </span>
                </div>
              </div>
            )}

            <div className="flex bg-black/40 rounded-2xl p-1 border border-white/5 overflow-hidden flex-shrink-0">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.label}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 md:px-5 py-2 rounded-xl text-[8px] md:text-[10px] font-black tracking-widest transition-all ${
                    timeframe.label === tf.label 
                      ? 'bg-blue-600 text-white shadow-[0_5px_15px_-5px_rgba(37,99,235,0.4)]' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col items-end flex-shrink-0">
              <span className={`text-lg md:text-2xl font-mono font-black tabular-nums tracking-tighter ${isLive ? 'text-white' : 'text-slate-600'}`}>
                {lastPrice?.toFixed(4) || '---.----'}
              </span>
              <div className="flex items-center gap-2">
                <div className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full ${isLive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-slate-700'}`} />
                <span className="text-[8px] md:text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black leading-none">Live</span>
              </div>
            </div>
          </div>
        </header>

        {/* Global Signal Alert Container */}
        <AnimatePresence>
          {(isExpired || isLimitReached) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <div className="max-w-md w-[92vw] bg-slate-900 border border-white/10 rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 text-center shadow-2xl">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-8 text-red-500">
                  <LockIcon size={40} />
                </div>
                <h2 className="text-3xl font-black text-white mb-4 italic uppercase tracking-tighter">
                  {isLimitReached ? 'Daily Limit Reached' : 'Plan Expired'}
                </h2>
                <p className="text-slate-400 mb-8 text-sm font-medium leading-relaxed">
                  {isLimitReached 
                    ? "You have used all signals for today according to your plan. Access will be restored in 24-25 hours." 
                    : "Your plan has expired. To continue using our professional signals, please use a redemption code."}
                </p>
                
                <div className="space-y-4">
                  <div className="relative group">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="text" 
                      value={redemptionCode}
                      onChange={(e) => setRedemptionCode(e.target.value)}
                      placeholder="ENTER REDEMPTION CODE"
                      className="w-full bg-black/40 border border-white/10 focus:border-blue-500 outline-none rounded-2xl py-4 pl-12 pr-4 text-sm font-mono text-white placeholder:text-slate-700"
                    />
                  </div>
                  {redemptionError && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest">{redemptionError}</p>}
                  <button 
                    onClick={handleRedeemCode}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all shadow-lg uppercase tracking-widest text-xs"
                  >
                    Activate Access
                  </button>
                  <a 
                    href="https://t.me/Binarytrader_et_bot" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-4 text-xs font-black text-slate-400 hover:text-white transition-colors"
                  >
                    HAVEN'T CODE? GET CODE <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            </motion.div>
          )}

          {showAdminPanel && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <div className="max-w-4xl w-full bg-slate-900 border border-white/10 rounded-[2.5rem] p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
                      <LayoutDashboard size={24} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Admin Control Center</h2>
                      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Manage licenses and view global insights</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowAdminPanel(false)}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors text-slate-400 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="grid lg:grid-cols-3 gap-8 mb-10">
                  <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                    <div className="flex items-center gap-3 mb-2 text-blue-400">
                      <Activity size={18} />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Total Market Activity</span>
                    </div>
                    <p className="text-4xl font-mono font-black text-white">{globalStats.total_signals}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 tracking-widest">Signals Propagated</p>
                  </div>
                  <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                    <div className="flex items-center gap-3 mb-2 text-emerald-400">
                      <Trophy size={18} />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Bullish Outcomes</span>
                    </div>
                    <p className="text-4xl font-mono font-black text-emerald-400">{globalStats.total_wins}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 tracking-widest">Confirmed Wins</p>
                  </div>
                  <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                    <div className="flex items-center gap-3 mb-2 text-red-500">
                      <XCircle size={18} />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Bearish Outcomes</span>
                    </div>
                    <p className="text-4xl font-mono font-black text-red-500">{globalStats.total_losses}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 tracking-widest">Confirmed Losses</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="p-8 bg-black/40 rounded-[2rem] border border-white/5">
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6">Generate New License Key</h3>
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Plan Tier</label>
                        <select 
                          value={newCodeType}
                          onChange={(e) => setNewCodeType(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3.5 text-sm font-bold text-white outline-none focus:border-blue-500"
                        >
                          <option value="VIP">VIP (18/day)</option>
                          <option value="ELITE">ELITE (30/day)</option>
                          <option value="PRO">PRO (40/day)</option>
                          <option value="MASTER">MASTER (50/day)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Duration (1-30 Days)</label>
                        <input 
                          type="number" 
                          min="1" 
                          max="30"
                          value={newCodeDays}
                          onChange={(e) => setNewCodeDays(parseInt(e.target.value))}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3.5 text-sm font-bold text-white outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="flex items-end">
                        <button 
                          onClick={createCode}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3.5 rounded-xl transition-all shadow-lg uppercase tracking-widest text-[10px]"
                        >
                          Forge License Key
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-black/20 rounded-[2rem] border border-white/5 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5">
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Key</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Tier</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Days</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                          <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Created At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {adminCodes.map((code) => (
                          <tr key={code.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">
                              <span className="font-mono font-black text-blue-400 text-xs">{code.code}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-black px-2 py-1 rounded ${
                                code.plan_type === 'MASTER' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-400'
                              }`}>{code.plan_type}</span>
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-300">{code.duration_days}D</td>
                            <td className="px-6 py-4">
                              {code.is_used ? (
                                <span className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold">
                                  <LockIcon size={12} /> USED
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-bold">
                                  <Activity size={12} /> ACTIVE
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right text-slate-500 text-[10px] font-mono">
                              {new Date(code.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {pendingSignal && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 50 }}
              className="absolute top-24 md:top-32 left-1/2 -translate-x-1/2 z-[120] w-[92vw] max-w-lg"
            >
              <div className="bg-slate-900/95 backdrop-blur-3xl border border-blue-500/30 rounded-3xl p-4 md:p-8 shadow-[0_0_50px_rgba(37,99,235,0.3)] overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600/20 rounded-xl text-blue-400">
                      <Bell size={20} className="animate-bounce" />
                    </div>
                    <span className="text-sm font-black text-blue-400 uppercase tracking-widest">New Signal Alert</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                    <Clock size={12} className="text-slate-400" />
                    <span className="text-[10px] font-mono font-bold text-slate-300">
                      ENTRY IN {pendingSignal.entryTime - serverTime}s
                    </span>
                  </div>
                  <button 
                    onClick={() => setPendingSignal(null)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors text-slate-500 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h4 className="text-2xl font-black text-white italic uppercase tracking-tighter">{pendingSignal.pairName}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Confirmed setup detected</p>
                  </div>
                  <div className={`p-4 rounded-2xl flex flex-col items-center gap-1 ${pendingSignal.type === 'RISE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-500'}`}>
                    {pendingSignal.type === 'RISE' ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
                    <span className="text-xs font-black">{pendingSignal.type}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[9px] text-slate-500 font-black uppercase mb-1">Enter Time (ETH)</p>
                    <p className="text-sm font-mono font-black text-white">{formatEthTime(pendingSignal.entryTime)}</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[9px] text-slate-500 font-black uppercase mb-1">Expiration</p>
                    <p className="text-sm font-mono font-black text-white">5 MIN DURATION</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTrade && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute top-24 md:top-32 left-1/2 -translate-x-1/2 md:left-auto md:right-10 md:translate-x-0 z-[110] w-[92vw] md:w-80"
            >
              <div className="bg-slate-950/80 backdrop-blur-3xl border-2 border-orange-500/30 rounded-3xl p-5 md:p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 blur-3xl -z-10" />
                <div className="flex items-center gap-3 mb-6">
                  <Timer size={20} className="text-orange-500 animate-pulse" />
                  <span className="text-xs font-black text-orange-400 uppercase tracking-widest">Trade in progress</span>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center text-white">
                    <span className="text-sm font-black italic">{activeTrade.pairName}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black ${activeTrade.type === 'RISE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-500'}`}>
                      {activeTrade.type}
                    </span>
                  </div>
                  
                  <div className="flex flex-col items-center py-4 bg-black/40 rounded-2xl border border-white/5">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] mb-2">Time Remaining</span>
                    <span className="text-4xl font-mono font-black text-white tabular-nums">
                      {Math.floor((activeTrade.expirationTime - serverTime) / 60)}:{((activeTrade.expirationTime - serverTime) % 60).toString().padStart(2, '0')}
                    </span>
                  </div>

                  <div className="flex justify-between text-[10px] font-bold">
                    <div className="flex flex-col">
                      <span className="text-slate-500">ENTRY</span>
                      <span className="text-white font-mono">{activeTrade.entryPrice.toFixed(4)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-slate-500">CURRENT</span>
                      <span className={`font-mono ${
                        (activeTrade.type === 'RISE' ? (lastPrice || 0) > activeTrade.entryPrice : (lastPrice || 0) < activeTrade.entryPrice)
                          ? 'text-emerald-400'
                          : 'text-red-500'
                      }`}>
                        {lastPrice?.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {tradeResult && (
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-[100] bg-black/40 backdrop-blur-sm"
            >
              <div className={`bg-slate-900 border-2 ${tradeResult.win ? 'border-emerald-500 shadow-[0_0_100px_rgba(16,185,129,0.3)]' : 'border-red-500 shadow-[0_0_100px_rgba(239,68,68,0.3)]'} rounded-[30px] md:rounded-[40px] p-6 md:p-12 flex flex-col items-center max-w-sm w-[90vw] mx-auto`}>
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${tradeResult.win ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-500'}`}>
                  {tradeResult.win ? <Trophy size={48} /> : <XCircle size={48} />}
                </div>
                <h2 className={`text-4xl font-black italic uppercase tracking-tighter mb-2 ${tradeResult.win ? 'text-emerald-400' : 'text-red-500'}`}>
                  Signal {tradeResult.win ? 'WIN' : 'LOSS'}
                </h2>
                <p className="text-slate-400 text-sm font-bold uppercase tracking-widest text-center mb-8">
                  The automated analysis has resolved
                </p>
                <div className="w-full grid grid-cols-2 gap-4 text-center">
                  <div className="p-4 bg-white/5 rounded-3xl border border-white/5">
                    <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Entry</p>
                    <p className="text-lg font-mono font-black text-white">{tradeResult.entryPrice.toFixed(4)}</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-3xl border border-white/5">
                    <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Exit</p>
                    <p className={`text-lg font-mono font-black ${tradeResult.win ? 'text-emerald-400' : 'text-red-500'}`}>
                      {tradeResult.exitPrice.toFixed(4)}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setTradeResult(null)}
                  className="mt-10 px-8 py-3 bg-white text-black font-black rounded-2xl hover:scale-105 transition-transform"
                >
                  CONTINUE
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chart Viewport */}
        <div className="flex-1 relative bg-[radial-gradient(circle_at_center,_rgba(37,99,235,0.03)_0%,_transparent_70%)]">
          {/* Zoom Controls */}
          <div className="absolute top-10 right-32 z-20 flex flex-col gap-2">
            <button 
              onClick={() => setZoom(prev => Math.min(prev + 0.2, 5))}
              className="w-10 h-10 bg-slate-900/80 backdrop-blur-3xl border border-white/10 rounded-xl flex items-center justify-center text-white hover:bg-blue-600 transition-all shadow-xl font-black text-xl"
            >
              +
            </button>
            <button 
              onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.3))}
              className="w-10 h-10 bg-slate-900/80 backdrop-blur-3xl border border-white/10 rounded-xl flex items-center justify-center text-white hover:bg-blue-600 transition-all shadow-xl font-black text-xl"
            >
              -
            </button>
          </div>

          <div 
            ref={chartContainerRef}
            className="w-full h-full cursor-crosshair opacity-90"
          />
          
          {/* Bottom Feed Overlay */}
          <div className="absolute bottom-6 left-4 right-4 md:left-10 md:right-10 flex flex-col md:flex-row items-center justify-between pointer-events-none gap-4">
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 text-[8px] md:text-[9px] font-mono font-black text-slate-600 uppercase tracking-[0.2em] md:tracking-[0.3em] bg-black/20 backdrop-blur px-4 py-2 rounded-full border border-white/5">
              <span className="flex items-center gap-2">Scanner: <span className={activeTrade ? 'text-orange-500' : 'text-emerald-500'}>{activeTrade ? 'PAUSED' : 'ACTIVE'}</span></span>
              {!activeTrade && <span className="hidden md:inline">{scanStatus}</span>}
              <span className="flex items-center gap-2">Latency <span className="text-emerald-500">22ms</span></span>
            </div>
            <div className="text-[8px] md:text-[9px] font-mono font-black text-slate-600 uppercase tracking-[0.2em] md:tracking-[0.3em] bg-black/20 backdrop-blur px-4 py-2 rounded-full border border-white/5">
              Terminal Alpha 4.0.2 • {formatEthTime(serverTime)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
