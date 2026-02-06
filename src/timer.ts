const ONE_SECOND: number = 1_000;

export function timer(
  seconds: number, 
  everySecond?: (remaining: number) => void, 
  whenDone?: () => void
): () => void  {

  let n = seconds;

  everySecond?.(n);
  console.log(n);

  const interval1 = setInterval(() => {
    n = n - 1;

    everySecond?.(n);
    console.log(n);

    if (n <= 0) {
      clearInterval(interval1);
      whenDone?.();
      console.log("over");
    }
  }, ONE_SECOND);

  return () => clearInterval(interval1);
}

