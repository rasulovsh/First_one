# Установленные скиллы

Все скиллы лежат в `.claude/skills/` (подхватываются Claude Code автоматически в этом проекте).
OpenMontage подключён как git-подмодуль в `tools/OpenMontage` (`git submodule update --init`).

| Группа | Папки | Источник |
|---|---|---|
| HyperFrames (HeyGen) | hyperframes, hyperframes-cli, hyperframes-registry, media-use, reverse-any-video, remotion-to-hyperframes, slideshow, figma | heygen-com/hyperframes |
| Remotion | remotion-* (12 шт.) | remotion-dev/skills |
| Эмиль Ковальский | emil-design-eng, animate, improve-animations, review-animations, animation-*, apple-design, break-ui, prototype и др. | emilkowalski/skills |
| Taste Skill | design-taste-frontend | Leonxlnx/taste-skill |
| Impeccable | impeccable | pbakaus/impeccable |
| Frontend Design | frontend-design | anthropics/skills |
| UI UX Pro Max | ui-ux-pro-max, design, design-system, brand, banner-design, slides, ui-styling | nextlevelbuilder/ui-ux-pro-max-skill |
| Ghost Editor | ghost-editor | kurbaitaev/ghost-editor |
| FFmpeg Skill | ffmpeg-skill | kajisho5/ffmpeg-skill |
| Claude Shorts | shorts | AgriciDaniel/claude-shorts |
| OpenMontage | tools/OpenMontage | calesthio/OpenMontage |

## Зависимости для видео-скиллов
- Node.js 22+, FFmpeg — общие для HyperFrames / Remotion / Shorts / Ghost Editor.
- Ghost Editor: `bash .claude/skills/ghost-editor/scripts/doctor.sh`, затем `python3 .claude/skills/ghost-editor/scripts/library_restore.py` (звуки/музыка ~60 МБ). Рассчитан на Mac.
- Claude Shorts: `bash .claude/skills/shorts/setup.sh`.
- OpenMontage: `cd tools/OpenMontage && make setup`.
