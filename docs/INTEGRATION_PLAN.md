# AMICAL LABS — objectif produit

## Ce ZIP ne remplace pas les données actuelles
Le projet est conçu comme une couche de travail non destructive. Ne supprimez pas les tables, collections, fichiers, comptes, crédits ou générations déjà présents dans le projet Hostinger.

Règle : connecter les écrans existants aux données réelles avant de remplacer quoi que ce soit.

## Objectif V1
1. Utilisateur authentifié
2. Personnage avec 1 à 3 références (face, dos, profil)
3. Upload vidéo source
4. Mode « Remplacer un personnage »
5. Sélection du personnage cible
6. Instructions générées proprement
7. Backend AMICAL appelle BytePlus
8. Retour du task_id
9. Polling du task_id
10. Enregistrement de la génération
11. Affichage dans Mes vidéos / Historique
12. Déduction des crédits uniquement lorsque la génération est effectivement lancée selon la règle métier
13. Aucun secret côté navigateur

## État de la base importée

Le ZIP d’origine contenait un frontend React et un bridge BytePlus, mais aucune couche d’authentification, base de données ou persistance de crédits/historique. La V1 ajoute une persistance JSON additive comme adaptateur de développement ; elle ne remplace pas les données Hostinger. Le branchement de la base et de l’auth existantes reste obligatoire avant production.

## Sécurité de l’intégration

- Les routes `/api/credits`, `/api/video/*` et `/api/video/history` refusent une requête sans identité serveur.
- Les tâches sont recherchées par `user_id + task_id`, jamais par task ID seul.
- La réservation de crédits et la transaction de débit sont atomiques dans l’adaptateur.
- Les remboursements d’échec sont idempotents.
- Les prompts sont bornés à 2 000 caractères.
- Les appels de génération et de polling sont limités par utilisateur.
- Les erreurs client ne contiennent pas le corps de réponse BytePlus.
- La clé n’est jamais écrite dans les logs, le bundle ou une variable `VITE_*`.

## BytePlus
Operator: las_video_edit_enhance
Template: replace/person_replace
Model: dreamina-seedance-2-5-260628
Base URL: https://operator.las.ap-southeast-1.bytepluses.com

Le frontend ne doit jamais appeler BytePlus directement.

## Références personnage
Le produit peut stocker les trois références :
- face
- back
- profile

Le backend choisit les URLs réellement nécessaires et construit le prompt de remplacement.

## Données existantes
Avant toute migration :
- conserver les identifiants existants ;
- ne pas recréer un compte utilisateur ;
- ne pas réinitialiser les crédits ;
- ne pas vider les vidéos ;
- ne pas supprimer les personnages ;
- ne pas remplacer la base de données ;
- ajouter des champs/collections seulement si nécessaires ;
- prévoir une migration réversible.

## Mode « Garder uniquement mon personnage »
Ne pas prétendre que cette fonction est terminée tant que le pipeline de suppression des autres personnages n'est pas validé. L'interface peut rester présente comme fonctionnalité en préparation.

## Secrets
Utiliser les variables d'environnement du backend :
BYTEPLUS_API_KEY
BYTEPLUS_BASE_URL
BYTEPLUS_OPERATOR_ID
BYTEPLUS_OPERATOR_VERSION
BYTEPLUS_MODEL

Ne jamais mettre une vraie clé API, un mot de passe IAM ou une clé secrète dans Git, dans le frontend ou dans un prompt utilisateur.
