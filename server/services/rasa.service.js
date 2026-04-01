import axios from "axios";

export const sendToRasa = async (userId, message) => {
  try {
    const response = await axios.post(
      "http://localhost:5005/webhooks/rest/webhook",
      {
        sender: String(userId),
        message,
      },
    );

    return response.data;
  } catch (error) {
    console.error("Rasa Error FULL:", error);
    return [];
  }
};
