import { NotFoundException, ParseUUIDPipe } from '@nestjs/common';

/** A route id that is not a uuid can't match anything, so answer 404 with a human message. */
export const uuidOr404 = (message: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException(message) });

export const ProductIdPipe = uuidOr404('Product not found.');
