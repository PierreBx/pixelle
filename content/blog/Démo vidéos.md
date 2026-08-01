---
publish: true
title: Démo vidéos
created: 2026-08-01
modified: 2026-08-01
---

Page de démonstration du prototype d'encapsulation YouTube. À supprimer une fois
le rendu validé.

## Lien markdown classique (`watch?v=`)

[Martha Argerich joue Rachmaninov](https://www.youtube.com/watch?v=tE2Vf2uo7Z8)

## Short — forme que le plugin Quartz ne reconnaît pas

<div class="yt-embed" role="button" tabindex="0" aria-label="Lire la vidéo : Un short" data-yt="RIlyLguqR8o" data-title="Un short" onclick="const f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+this.dataset.yt+'?autoplay=1';f.title=this.dataset.title||'Vidéo YouTube';f.className='yt-player';f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';f.allowFullscreen=true;this.replaceWith(f)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
  <img src="../_assets/images/youtube/rilylguqr8o.jpg" alt="" loading="lazy" />
  <span class="yt-play" aria-hidden="true">▶</span>
</div>

## `youtu.be` avec emoji collé par le partage iOS

[Lien partagé depuis l'iPhone](https://youtu.be/cMeKHi9JEi4▶️)

## URL nue, sans lien markdown

<div class="yt-embed" role="button" tabindex="0" aria-label="Lire la vidéo : Vidéo YouTube" data-yt="oS8bpiD7wFI" data-title="Vidéo YouTube" onclick="const f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+this.dataset.yt+'?autoplay=1';f.title=this.dataset.title||'Vidéo YouTube';f.className='yt-player';f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';f.allowFullscreen=true;this.replaceWith(f)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
  <img src="../_assets/images/youtube/os8bpid7wfi.jpg" alt="" loading="lazy" />
  <span class="yt-play" aria-hidden="true">▶</span>
</div>

## Lien de chaîne — ne doit PAS être encapsulé

[La chaîne de David Abbasi](https://www.youtube.com/@DavidAbbasiMD)
