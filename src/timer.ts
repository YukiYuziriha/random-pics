const SECOND: number = 1_000;

export function timer(countdown: number, second: number = SECOND): void  {
  let n = countdown;
  console.log(n);
  const interval1 = setInterval(() => {
    console.log(--n);
    if (n <= 0) {
      clearInterval(interval1);
      console.log("over");
      return true
    }
  }, second);
}

console.log(timer(7));
