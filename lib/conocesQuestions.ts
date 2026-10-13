/**
 * Questions for ¿Cuánto me conocés?, asked to the player in turn (in vos).
 * Rooms pick them by index, so the list is append-only: reordering or
 * removing changes the questions of rooms already created. Options keep
 * their order on screen.
 */

export interface ConocesQuestion {
  q: string;
  a: string[];
}

export const CONOCES_QUESTIONS: ConocesQuestion[] = [
  { q: "¿Qué preferís para unas vacaciones?", a: ["Playa", "Montaña", "Ciudad", "Quedarme en casa"] },
  { q: "¿Cuál es tu comida ideal para un domingo?", a: ["Asado", "Pastas", "Pizza", "Sushi"] },
  { q: "Un sábado a la noche perfecto es…", a: ["Salir a bailar", "Cena con amigos", "Peli y sillón", "Dormir temprano"] },
  { q: "¿Qué superpoder elegirías?", a: ["Volar", "Ser invisible", "Teletransportarme", "Leer la mente"] },
  { q: "¿Cómo tomás el café?", a: ["Solo", "Con leche", "Cortado", "No tomo café"] },
  { q: "¿Perros o gatos?", a: ["Perros", "Gatos", "Los dos", "Ninguno"] },
  { q: "Si ganás la lotería, lo primero que hacés es…", a: ["Viajar", "Comprar una casa", "Ahorrar todo", "Dejar de trabajar"] },
  { q: "¿Qué hacés cuando suena el despertador?", a: ["Me levanto al toque", "Posponer una vez", "Posponer mil veces", "No uso despertador"] },
  { q: "¿Cuál es tu estación del año favorita?", a: ["Verano", "Otoño", "Invierno", "Primavera"] },
  { q: "¿Dulce o salado?", a: ["Dulce", "Salado", "Depende del día"] },
  { q: "En una fiesta, vos sos el que…", a: ["Baila toda la noche", "Charla en un rincón", "Está en la comida", "Se va temprano"] },
  { q: "¿Qué te da más miedo?", a: ["Las alturas", "Los bichos", "La oscuridad", "Hablar en público"] },
  { q: "¿Cuál es tu forma favorita de relajarte?", a: ["Dormir una siesta", "Hacer deporte", "Ver series", "Salir a caminar"] },
  { q: "¿Cómo preferís comunicarte?", a: ["Mensajes de texto", "Audios", "Llamadas", "En persona"] },
  { q: "¿Qué género de película elegís?", a: ["Comedia", "Terror", "Acción", "Drama romántico"] },
  { q: "¿Cuántas horas necesitás dormir para estar bien?", a: ["Menos de 6", "6 o 7", "8", "Más de 9"] },
  { q: "¿Sos de llegar…?", a: ["Antes de hora", "Justo a tiempo", "Un poquito tarde", "Muy tarde"] },
  { q: "¿Qué te sale mejor?", a: ["Cocinar", "Ordenar", "Arreglar cosas", "Nada de eso"] },
  { q: "Para festejar tu cumpleaños preferís…", a: ["Fiesta grande", "Cena íntima", "Un viaje", "Que nadie se acuerde"] },
  { q: "¿Con qué personaje te identificás más?", a: ["El líder", "El gracioso", "El inteligente", "El misterioso"] },
  { q: "¿Qué no puede faltar en tu heladera?", a: ["Gaseosa o cerveza", "Queso", "Frutas y verduras", "Algo dulce"] },
  { q: "¿Qué hacés si te sobran dos horas libres?", a: ["Duermo", "Leo o veo algo", "Salgo", "Ordeno la casa"] },
  { q: "¿Cuál sería tu trabajo soñado?", a: ["Artista", "Viajero profesional", "Empresario", "Deportista"] },
  { q: "¿Qué es lo primero que hacés al despertarte?", a: ["Miro el celular", "Me baño", "Desayuno", "Me quedo un rato en la cama"] },
  { q: "¿Cómo manejás la plata?", a: ["Ahorro todo", "Gasto todo", "Mitad y mitad", "Ni idea a dónde se va"] },
  { q: "En un viaje, vos sos quien…", a: ["Arma todo el itinerario", "Se deja llevar", "Saca todas las fotos", "Se pierde"] },
  { q: "¿Qué música no puede faltar en una previa?", a: ["Cumbia", "Reggaetón", "Rock", "Pop"] },
  { q: "¿Cuál es tu peor hábito?", a: ["Dejar todo para último momento", "Comerme las uñas", "Estar con el celular", "Ser desordenado"] },
  { q: "¿Qué preferís de desayuno?", a: ["Mate con algo", "Café con medialunas", "Algo salado", "Nada, no desayuno"] },
  { q: "¿Mar o pileta?", a: ["Mar", "Pileta", "Ninguno: no me meto al agua"] },
  { q: "Si fueras un animal, serías…", a: ["Un león", "Un perezoso", "Un delfín", "Un búho"] },
  { q: "¿Qué hacés cuando estás triste?", a: ["Hablo con alguien", "Me encierro solo", "Como algo rico", "Hago deporte"] },
  { q: "¿Qué te enoja más?", a: ["Que lleguen tarde", "Que me interrumpan", "Que me mientan", "El tránsito"] },
  { q: "¿Con quién te irías a una isla desierta?", a: ["Mi pareja", "Mi mejor amigo", "Alguien de mi familia", "Sola/o, tranqui"] },
  { q: "¿Qué época te hubiera gustado vivir?", a: ["Los 60", "Los 80", "Los 90", "El futuro"] },
  { q: "¿Cuál es tu red social favorita?", a: ["Instagram", "TikTok", "WhatsApp", "Ninguna"] },
  { q: "¿Qué te gusta regalar?", a: ["Algo hecho por mí", "Una experiencia", "Algo útil", "Plata o una gift card"] },
  { q: "¿Cómo reaccionás a una sorpresa?", a: ["Me encanta", "Me pongo nerviosa/o", "Lloro", "Prefiero saber todo antes"] },
  { q: "¿Qué serie volverías a ver desde el principio?", a: ["Una comedia", "Un policial", "Una de fantasía", "No repito series"] },
  { q: "¿Qué hacés en un día de lluvia?", a: ["Tortas fritas", "Duermo", "Salgo igual", "Maratón de series"] },
  { q: "¿Cuál es tu mayor talento oculto?", a: ["Cantar", "Imitar voces", "Cocinar", "Recordar todo"] },
  { q: "¿Qué tan ordenada/o es tu pieza?", a: ["Impecable", "Más o menos", "Caos organizado", "Mejor no preguntar"] },
  { q: "¿Qué preferís: dar o recibir regalos?", a: ["Dar", "Recibir", "Las dos cosas"] },
  { q: "¿Qué hacés con la última porción?", a: ["Me la como", "La ofrezco", "La parto al medio", "La dejo ahí para siempre"] },
  { q: "¿Qué palabra te define mejor?", a: ["Divertida/o", "Responsable", "Soñadora/o", "Tranqui"] },
  { q: "¿Cuál es tu deporte favorito para mirar?", a: ["Fútbol", "Tenis", "Básquet", "No miro deportes"] },
  { q: "¿Cómo elegís qué comer en un restaurante?", a: ["Siempre lo mismo", "Lo más raro de la carta", "Lo que pide el de al lado", "Tardo una eternidad"] },
  { q: "¿Qué harías con un día sin celular?", a: ["Sería feliz", "Lo sufriría", "Ni me daría cuenta", "Imposible"] },
  { q: "¿Montaña rusa o calesita?", a: ["Montaña rusa", "Calesita", "Ninguna, miro desde abajo"] },
  { q: "¿Cuál es tu plan ideal en pareja?", a: ["Cena afuera", "Cocinar juntos", "Viaje sorpresa", "Sillón y manta"] },
  { q: "¿Qué te cuesta más?", a: ["Pedir perdón", "Decir que no", "Madrugar", "Quedarme quieta/o"] },
  { q: "¿Qué comida no comerías nunca?", a: ["Hígado", "Mariscos", "Picante", "Como de todo"] },
];
