# 12 — Definition of done

Verify each by **doing it**, not by reading the code.

### 1. Realtime works both ways

Two browsers, signed in as different users. A task completed in one animates in the other within a second, with the partner's identity dot pulsing. Neither side flickers.

### 2. A fast clear-out feels good

Complete five tasks in quick succession. The tones rise through the scale. No spinner appears at any point. Nothing jumps or shifts.

### 3. View switching is free

Move between Aujourd'hui, Demain, Semaine, Mois and the calendar. Zero network requests in the network tab. Zero loading states. Scroll position survives.

### 4. Mouse-free operation

Create a task, assign it, date it, complete it, and undo it — without touching the mouse. Then find it again with `⌘K`.

### 5. Timezone is correct

A task due today still appears under "Aujourd'hui" at 11pm Montreal time, in both winter and summer offsets. Test by changing the system clock, not by reasoning about it.

### 6. Invitations land

Invite a fresh address. The email arrives, in French, and the link puts the new user directly inside the workspace with the right role.

### 7. Uninvited access is empty

Sign up with an address that has no pending invite. You get `/no-access`, and a direct query against `tasks` returns an empty set rather than an error.

### 8. It's worth doing again tomorrow

Clear the day's last task. The sweep, the ring, the settled state.

**This is the actual acceptance test.** If it does not pass, the build is not done, regardless of the other seven. If it feels flat, the problem is usually one of the four values in section 8.9 — most often the row hold being too short, or the tone gain being too low to register.
