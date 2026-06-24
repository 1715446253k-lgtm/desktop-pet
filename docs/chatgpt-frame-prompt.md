# ChatGPT Frame Generation Prompt

Use this prompt when generating animation frames from a customer reference image.

```text
Create transparent-background PNG animation frames for a desktop pet.

Character identity:
- Keep the same face, proportions, outfit, colors, markings, and overall style as the reference image.
- Full body must be visible in every frame.
- No text, no background, no scenery, no shadows, no motion lines, no floating symbols, no speech bubbles.
- The character should stay centered and readable at small desktop-pet size.
- Use clean alpha transparency.
- Leave transparent padding around the character on all four edges.
- No opaque pixels should touch the image edge.

Canvas:
- Square PNG, at least 512x512.
- Transparent background.
- One character only.

Generate this state:
<STATE_NAME>

Frame count:
<FRAME_COUNT>

Motion direction:
<STATE_SPECIFIC_DIRECTION_OR_ACTION>

Output:
- Produce separate PNG frames.
- Name them 000.png, 001.png, 002.png, etc.
- Keep visual scale and baseline stable across frames.
```

## State Specs

`idle`

- 6 frames.
- Calm breathing, blink, small head/body bob.
- No waving, jumping, running, sleeping, or props.

`run-right`

- 8 frames.
- Character faces and moves toward the right.
- Alternating feet/limbs, no speed lines or dust.

`run-left`

- 8 frames.
- Character faces and moves toward the left.
- Alternating feet/limbs, no speed lines or dust.

`jump`

- 6 frames.
- Vertical body motion only.
- No floor mark, impact burst, shadow, or dust.

`play`

- 6 frames.
- Cheerful playful gesture.
- Keep existing character identity; avoid adding new unrelated props.

`sleep`

- 6 frames.
- Sleeping or drowsy pose.
- No floating Z letters or thought bubbles.

`interact`

- 6 frames.
- Friendly reaction to user click, such as wave or happy pose.
- Gesture should be shown by the body or limb only.
```

## Review Checklist

- Same character in every frame.
- Same art style in every state.
- Transparent PNG alpha exists.
- Edges remain transparent; no white/solid square background.
- No cropped body parts.
- No detached effects.
- No background color.
- Motion reads clearly when frames are played in sequence.
