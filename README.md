## how to run shit in dev mode: 
```
neu run
```

```
bun run build:watch
```
## what even is this?
that's image player/randomizer/slideshow app that is supposed to be my own version of gesturedrawing! app. 
## usecase
gesture drawing, timed reference slideshow.
## why its good?
- batch indexing (fast eating huge folders with nexted folders with shit load of images)
- doesnt stupidly freeze when loading stuff (hello GestureDrawing! app)
- switch between normal order and random order of images any moment
- remembers history, random history, folder history until you make it forget

## current state
can randomly serve pictures. 
no timer yet, can load next/prev image in random/normal order. history of random/normal order/folders preserves forever.
can wipe everything.

## next milestones
- timer
- TUI theme
- normie theme
- package and make it run on windows and debian from executable
