/**
 * Words for Mímica: things you can act out without talking. A game walks a
 * seeded shuffle of the whole list, so it's append-only: reordering or
 * removing changes the words of rooms already created.
 */

export interface MimicaWord {
  w: string;
  cat: string;
}

const group = (cat: string, words: string[]): MimicaWord[] => words.map((w) => ({ w, cat }));

export const MIMICA_WORDS: MimicaWord[] = [
  ...group("Acción", [
    "Lavarse los dientes", "Cebar mate", "Andar en bicicleta", "Hacer un asado", "Cambiar un pañal",
    "Pescar", "Bailar tango", "Manejar un colectivo", "Peinarse", "Hacer flexiones",
    "Saltar la soga", "Planchar", "Sacar una selfie", "Pintar una pared", "Tejer",
    "Atarse los cordones", "Hacer malabares", "Esquiar", "Remar", "Escalar una montaña",
    "Ordeñar una vaca", "Barrer", "Cortar el pasto", "Hacer pochoclo", "Tocar el timbre y salir corriendo",
    "Inflar un globo", "Despertarse tarde", "Meditar", "Hacer surf", "Patear un penal",
    "Abrir un regalo", "Ponerse lentes de contacto", "Estornudar", "Bostezar", "Dar un discurso",
  ]),
  ...group("Animal", [
    "Gallina", "Canguro", "Pingüino", "Mono", "Elefante", "Serpiente", "Cangrejo", "Pulpo",
    "Jirafa", "Perro", "Gato", "León", "Pato", "Caballo", "Tortuga", "Mariposa", "Rana",
    "Murciélago", "Flamenco", "Cocodrilo", "Oso", "Pavo real", "Foca", "Mosquito",
  ]),
  ...group("Oficio", [
    "Bombero", "Dentista", "Peluquero", "Cocinero", "Policía de tránsito", "Mago", "Payaso",
    "Cirujano", "Fotógrafo", "Albañil", "Director de orquesta", "Piloto de avión", "Mozo",
    "Profesor", "Astronauta", "Jardinero", "Árbitro", "Carnicero", "Cajero de supermercado", "Pintor",
  ]),
  ...group("Deporte", [
    "Boxeo", "Tenis", "Natación", "Golf", "Básquet", "Arquero", "Karate", "Bowling",
    "Ping pong", "Levantamiento de pesas", "Esgrima", "Patinaje", "Vóley", "Rugby", "Tiro con arco",
  ]),
  ...group("Película o personaje", [
    "Titanic", "Spiderman", "Superman", "El rey león", "Tarzán", "Harry Potter", "Frankenstein",
    "Drácula", "Rocky", "Shrek", "Batman", "La sirenita", "Piratas del Caribe", "Star Wars",
    "Indiana Jones", "Pinocho", "Caperucita Roja", "Hulk", "Zombie", "Michael Jackson",
  ]),
  ...group("Objeto", [
    "Paraguas", "Lavarropas", "Ventilador", "Reloj despertador", "Tijera", "Martillo", "Ascensor",
    "Microondas", "Secador de pelo", "Bicicleta", "Guitarra", "Piano", "Trompeta", "Cámara de fotos",
    "Teléfono", "Licuadora", "Escalera", "Hamaca", "Calesita", "Sacacorchos",
  ]),
];
