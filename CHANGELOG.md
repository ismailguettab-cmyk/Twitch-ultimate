# Historique des versions

Notez ici ce qui change à chaque release, puis copiez-le dans la description de la release GitHub :
l’app affiche ce texte dans la fenêtre de mise à jour.

## 1.5.0
Profils et lancement
- Écran « Qui regarde ? » au lancement, type Netflix : choix du compte, bouton « Ajouter un compte », animation et petit son de connexion. Les jetons de chaque compte sont conservés séparément.

VOD (ex-Aujourd’hui)
- Onglet renommé « VOD » avec une icône dédiée.

Suivis
- Chaque vignette affiche « En live » animé, ou « Accéder au profil » hors ligne.
- Clic sur une chaîne en live : bulle proposant « Regarder le live » ou « Accéder au profil ».
- Page profil du streamer : header (photo, bio, abonnés, ancienneté) et liste complète des rediffusions.
- Retrait du libellé « Hors ligne » parasite.

Catégories
- Rang affiché en pastille sur la miniature (DA de l’app), signe ~ et numéro retirés du texte, vignettes épurées.
- Filtre International / Français dans chaque catégorie.

Lecteur (design liquid glass)
- Barre et menus retravaillés en verre dépoli aux couleurs de l’app.
- « Chat » ouvre une liste afficher / masquer ; « Repositionner le chat » permet de le placer librement à la télécommande puis valider avec OK.
- Bouton favori retiré.
- « Multiplex de stream » : les deux lives empilés verticalement, choix du haut/bas, réglage du volume de chaque stream et mute nommé « Mute le stream de … ».
- Bouton « Qualité » avec la liste de toutes les qualités, 2K et 4K incluses quand disponibles.

Divers
- Micro-vignette sur les cartes de live indiquant si les rediffusions sont accessibles ou verrouillées.
- Navigation horizontale corrigée : plus de saut de lignes ni d’ouverture du menu quand on va vite à gauche.

## 1.4.0
- Accueil repensé en « Lives suivis » : uniquement vos chaînes suivies en direct, en grandes miniatures.
- Sections retirées de l’accueil (lives du jour, clips, catégories, chaînes suivies) pour un affichage épuré.
- Quand personne de suivi n’est en live : 10 lives français du moment, classés par buzz.
- Icône du menu « Lives suivis » animée quand au moins une chaîne est en direct, logo propre sinon.
- Aperçu du live avec le son dans les miniatures de la page.
- Recherche redessinée : clavier animé, résultats dynamiques avec le jeu, la durée du live et le nombre de spectateurs ; bloc « Catégories populaires » retiré.
- Correction du clavier de recherche qui sautait vers les résultats en descendant.

## 1.3.0
- Rediffusions des abonnés : en connectant votre propre session Twitch (Réglages > Rediffusions des abonnés), les rediffs réservées des chaînes auxquelles vous êtes abonné deviennent lisibles.
- Les pubs disparaissent aussi sur ces chaînes (ou partout avec Twitch Turbo).
- Clavier à l’écran pour saisir ou coller la clé ; messages plus clairs quand une rediff est réservée.

## 1.2.0
- Accueil personnalisable : choisissez les rangées affichées et leur ordre (Réglages ou bas de l’accueil).
- Accueil plus léger par défaut : bandeau, lives, « Continuer à regarder » et rediffs du jour.
- Aperçu dans les vignettes : l’image s’affiche (elle restait noire sur le Fire Stick).
- Rangées : la flèche gauche revient bien aux vignettes précédentes au lieu d’ouvrir le menu.
- Page Aujourd’hui refaite : liste claire des lives ratés et grand aperçu à droite.

## 1.1.1
- Catégories : toutes les vignettes ont la même taille, même avec un nom de jeu long.
- L’aperçu du live dans les vignettes a maintenant le son (le bandeau d’accueil reste muet).

## 1.1.0
- Le live se lance dans la vignette sélectionnée, et dans le bandeau d’accueil.
- Nombre total de spectateurs sur chaque catégorie.
- Lecteur : la qualité se choisit dans une liste au lieu de défiler une par une.

## 1.0.2
- Correction de l’affichage agrandi sur le Fire Stick.

## 1.0.0
- Première version : accueil, rediffusions du jour, suivis, catégories, recherche, réglages.
- Lecteur en qualité source, chat par-dessus la vidéo, 2e live en incrustation, zapping, statistiques.
- Blocage des coupures pub, connexion par QR code, mises à jour automatiques depuis GitHub.
