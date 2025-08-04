import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

export const migrateCompanies = async () => {
  try {
    const snapshot = await getDocs(collection(db, "companies"));

    if (snapshot.empty) {
      console.log("⚠️ Aucune compagnie trouvée.");
      return;
    }

    for (const companyDoc of snapshot.docs) {
      const companyData = companyDoc.data();
      const companyId = companyDoc.id;

      let updatedData: any = {};
      let needsUpdate = false;

      // Vérifie les champs critiques et ajoute ceux qui manquent
      if (companyData.publicVisible === undefined) {
        updatedData.publicVisible = true;
        needsUpdate = true;
      }

      if (companyData.modifiable === undefined) {
        updatedData.modifiable = true;
        needsUpdate = true;
      }

      if (companyData.commissionRate === undefined) {
        updatedData.commissionRate = companyData.commission
          ? companyData.commission / 100
          : 0.1; // 10% par défaut
        needsUpdate = true;
      }

      if (!companyData.footerConfig) {
        updatedData.footerConfig = {
          showSocialMedia: true,
          showTestimonials: true,
          showLegalLinks: true,
          showContactForm: true,
          customLinks: []
        };
        needsUpdate = true;
      }

      if (!companyData.socialMedia) {
        updatedData.socialMedia = {
          facebook: "",
          instagram: "",
          twitter: "",
          linkedin: "",
          youtube: "",
          tiktok: "",
          whatsapp: ""
        };
        needsUpdate = true;
      }

      if (!Array.isArray(companyData.imagesSlider)) {
        updatedData.imagesSlider = [];
        needsUpdate = true;
      }

      if (needsUpdate) {
        await updateDoc(doc(db, "companies", companyId), updatedData);
        console.log(`✅ Compagnie ${companyData.nom || companyId} mise à jour`);
      } else {
        console.log(`✔️ Compagnie ${companyData.nom || companyId} déjà conforme`);
      }
    }

    console.log("🎉 Migration terminée avec succès !");
  } catch (error) {
    console.error("❌ Erreur lors de la migration :", error);
  }
};
