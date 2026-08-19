import { useEffect, useState } from 'react';

/**
 * `navigator.onLine` показывает наличие сетевого интерфейса, а не доступность сервера,
 * поэтому используется только для индикатора и для перехода в режим чтения сохранённого
 * плана. Решения о свежести данных принимаются по времени получения (§14.3), а не по этому
 * флагу.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = (): void => setOnline(true);
    const goOffline = (): void => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return (): void => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
