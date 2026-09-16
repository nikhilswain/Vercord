import { useEffect, useState } from 'react';

/** Mount with the message as its key, leaving no permanent instruction box. */
export function HudNotice({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p className="rpg-adventure-message" data-visible={visible} role="status">
      {visible ? message : ''}
    </p>
  );
}
