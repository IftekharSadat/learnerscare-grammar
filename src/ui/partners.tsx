/** Partner characters for the Talk level: original speech-bubble people from the same family as Pip. */
import { motion } from 'framer-motion';

const LOOKS: Record<string, { body: string; shade: string; accent: string; hair: string }> = {
  teal: { body: '#0FA597', shade: '#45D6C6', accent: '#FFC83D', hair: '#14184A' },
  coral: { body: '#E8473A', shade: '#FF8A7F', accent: '#14184A', hair: '#7A3B12' },
  gold: { body: '#FFC83D', shade: '#FFE08A', accent: '#6C4DF4', hair: '#2B1F7A' },
};

export function Partner({ look = 'teal', emotion = 'smile', speaking = false, size = 96, name }: {
  look?: string; emotion?: 'smile' | 'surprised' | 'thinking'; speaking?: boolean; size?: number; name?: string;
}) {
  const c = LOOKS[look] ?? LOOKS.teal;
  const ink = look === 'gold' ? '#14184A' : '#fff';
  return (
    <motion.svg width={size} height={size} viewBox="0 0 80 80" role="img" aria-label={name ? `${name}${speaking ? ' is speaking' : ''}` : 'Conversation partner'}
      animate={{ y: [0, -2.5, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}>
      <path d="M22 60 L15 76 L36 64 Z" fill={c.accent} />
      <rect x="8" y="10" width="64" height="54" rx="24" fill={c.body} />
      <rect x="8" y="10" width="64" height="26" rx="22" fill={c.shade} opacity="0.5" />
      {look === 'teal' && <path d="M14 30 Q20 6 44 8 Q66 8 68 30 Q58 16 40 17 Q24 17 14 30Z" fill={c.hair} />}
      {look === 'coral' && <><path d="M18 22 Q40 0 62 22 Q50 14 40 15 Q28 14 18 22Z" fill={c.hair} /><rect x="24" y="30" width="13" height="10" rx="4" fill="none" stroke={c.accent} strokeWidth="2" /><rect x="43" y="30" width="13" height="10" rx="4" fill="none" stroke={c.accent} strokeWidth="2" /></>}
      {look === 'gold' && <path d="M12 34 Q10 8 40 8 Q70 8 68 34 Q66 46 62 50 Q66 22 40 19 Q14 22 18 50 Q13 46 12 34Z" fill={c.hair} />}
      {emotion === 'thinking' ? (<><path d="M25 35 H35 M45 33 H55" stroke={ink} strokeWidth="3" strokeLinecap="round" /></>)
        : (<><ellipse cx="30" cy="35" rx="4.5" ry={emotion === 'surprised' ? 6 : 5} fill="#fff" /><ellipse cx="50" cy="35" rx="4.5" ry={emotion === 'surprised' ? 6 : 5} fill="#fff" /><circle cx="30.5" cy="36" r="2.2" fill="#14184A" /><circle cx="50.5" cy="36" r="2.2" fill="#14184A" /></>)}
      {speaking ? (
        <motion.ellipse cx="40" cy="50" rx="6" fill="#14184A" animate={{ ry: [2, 5.5, 3, 6, 2] }} transition={{ duration: 0.55, repeat: Infinity }} />
      ) : emotion === 'surprised' ? <ellipse cx="40" cy="50" rx="4" ry="4.5" fill="#14184A" />
        : emotion === 'thinking' ? <path d="M33 51 H46" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        : <path d="M31 47 Q40 57 49 47" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />}
    </motion.svg>
  );
}
