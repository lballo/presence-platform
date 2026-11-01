-- La couleur choisie pour un événement sans photo. Vide : la couleur suit le format de l'événement, comme avant.
alter table presence.events add column cover varchar(20) not null default '';
