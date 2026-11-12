-- Retours vidéo : une demande peut aller à la communauté ou aux seuls modérateurs (l'équipe Présence).
-- Ajout seul. La RLS ne change pas : audience_includes_me() renvoie faux pour « moderateurs »,
-- donc seuls l'auteur et les administrateurs lisent ces publications et leurs réponses.
alter type presence.forum_audience add value if not exists 'moderateurs';
